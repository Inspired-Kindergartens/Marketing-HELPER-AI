// AI images for a page's photo slots (the Info Sheets). The page's own code
// never talks to OpenAI: it is handed the generator and regenerator made
// here, and a picture is only ever sent after assertNoRealChildren passes.
import { getImageAiConfig, readImageAiConfigStatus, type ImageAiEnv } from "./config.js";
import { ImageAiError, editImage, generateImage, parseImageOptions, type FetchLike, type GeneratedImage } from "./openai.js";

// Landscape, the shape of the info sheet's photo slots (about 1.43 to 1), as
// a JPEG the PDF can hold. For print it is the largest picture of that shape
// the image model makes: 3456 x 2400 is exactly IMAGE_MAX_PIXELS.
export const SLOT_IMAGE_SIZE = "3456x2400";
const SLOT_IMAGE_QUALITY = "medium";

// What a page says when the OpenAI key is not in .env.
export const AI_IMAGES_NOT_SET_UP = "AI images are not set up yet: add OPENAI_API_KEY to the .env file and restart the app.";

export type SlotImageGenerator = (prompt: string) => Promise<GeneratedImage>;

// Makes a picture from a description (words only go to OpenAI). Undefined
// when the OpenAI key is not set, and the page then says so.
export function createSlotImageGenerator(env: ImageAiEnv, fetchImpl: FetchLike = fetch): SlotImageGenerator | undefined {
  if (!readImageAiConfigStatus(env).isConfigured) return undefined;
  const config = getImageAiConfig(env);
  return (prompt) =>
    generateImage(config, parseImageOptions({ prompt, size: SLOT_IMAGE_SIZE, quality: SLOT_IMAGE_QUALITY, format: "jpeg" }), fetchImpl);
}

// ---- The rule ------------------------------------------------------------------
//
// An image of real children is NEVER uploaded to OpenAI. Before a picture is
// sent, the user is asked "Does this image contain real children?" and it
// only goes when they answer no. A picture the app itself got from the AI
// image model (its record says aiGenerated) skips the question: any children
// in it are not real.
export const REAL_CHILDREN_QUESTION = "Does this image contain real children?";

export function assertNoRealChildren(image: { aiGenerated?: boolean | null } | null | undefined, answer: unknown): void {
  if (image?.aiGenerated === true) return;
  if (answer === "no") return;
  if (answer === "yes") {
    throw new ImageAiError("This image was not sent. An image with real children in it is never uploaded.", 403);
  }
  throw new ImageAiError(`Answer first: ${REAL_CHILDREN_QUESTION}`, 400);
}

// ---- Regeneration --------------------------------------------------------------

// What is asked for when the user types nothing. The first is the default.
export const REGENERATION_OPTIONS = [
  {
    key: "same-children",
    label: "The same number of children, doing the same things",
    text: "Replace every child in the photograph with a new, different child: exactly the same number of children as in the original, each in the same position, pose and activity as the child they replace. If there are no children in the photograph, add two or three children playing together, engaged in an activity that suits this scene.",
  },
  { key: "small-group", label: "Two or three children playing together", text: "Show two or three children playing together, engaged in an activity that suits this scene, in place of any children in the original." },
  { key: "one-child", label: "One child", text: "Show one child absorbed in an activity that suits this scene, in place of any children in the original." },
  { key: "busy-group", label: "A busy group of children", text: "Show six to eight children spread across the scene, each busy with an activity that suits it, some of them playing together, in place of any children in the original." },
  { key: "with-teacher", label: "Children with a teacher", text: "Show three children and one adult teacher who is down at the children's level, all engaged together in an activity that suits this scene, in place of any people in the original." },
] as const;

// The people in the old picture never carry over. What the request leaves
// unsaid (how many children, what they are doing) is taken from the old picture.
const REPLACE_GUIDANCE =
  "None of the people in the original photograph may remain in the result: every child or adult shown is a new, different person with a different face, hair and clothes. Where the request above does not say how many children to show, show exactly as many as the original photograph has. Where it does not say what they are doing, each child keeps the position, pose and activity of the child they replace.";

const SCENE_GUIDANCE =
  "Keep this photograph's place exactly as it is: the same buildings, play equipment, plants, ground, camera angle, light and colours. The result must look like a real, unposed documentary photograph taken at a New Zealand kindergarten. Do not add text, logos or signs.";

// Who the children are. The word for the people is deliberately not used:
// image models answer it with historical costume instead of today's children.
const CHILDREN_GUIDANCE =
  "Any children shown are preschoolers aged two to four, a natural mix of New Zealand children: about half are Polynesian New Zealanders with warm brown skin, dark brown eyes and dark wavy or curly hair, alongside Pacific Island, European and Asian children. They wear ordinary modern play clothes such as t-shirts, shorts, leggings, jumpers and sun hats, with gumboots or bare feet. Their faces are natural and relaxed.";

function everydayWords(request: string): string {
  return request.replace(/\bm[aā]ori\b/gi, "Polynesian New Zealander");
}

// The description sent with the picture: the user's request, or the chosen
// option when they typed nothing, between the fixed scene guidance and the
// fixed replace and children guidance.
export function buildRegenerationPrompt(input: { request?: string; option?: string }): string {
  const request = everydayWords(String(input.request ?? "").trim());
  const option = REGENERATION_OPTIONS.find((entry) => entry.key === input.option) ?? REGENERATION_OPTIONS[0];
  return [SCENE_GUIDANCE, request || option.text, REPLACE_GUIDANCE, CHILDREN_GUIDANCE].join("\n\n");
}

// ---- Upscaling -----------------------------------------------------------------

// A photo cropped so tightly that it has too few pixels to print sharply is
// drawn again at full size. Nothing in it may change: this asks for the same
// photograph, only sharper. It is drawn at a higher quality than a
// regeneration, so the detail it is given is kept.
export const UPSCALE_PROMPT =
  "Reproduce this photograph exactly as it is, at a higher resolution. Keep everything in it unchanged: the same framing and composition, the same people with the same faces, expressions, hair and clothes, the same objects, buildings, plants, light and colours. Do not add, remove, move, replace or restyle anything. Only make it sharper: restore fine detail and remove blur, pixelation and compression marks. The result must look like the same real photograph, taken with a better camera. Do not add text, logos or signs.";
const UPSCALE_QUALITY = "high";

export type SlotImageRegenerator = (input: {
  image: { bytes: Buffer; mimeType: string; aiGenerated: boolean };
  // The user's answer to REAL_CHILDREN_QUESTION: "yes" or "no".
  containsRealChildren: unknown;
  request?: string;
  option?: string;
  // The same picture at full size (UPSCALE_PROMPT) rather than a new one.
  upscale?: boolean;
}) => Promise<GeneratedImage & { prompt: string }>;

// Makes a new picture from the one in a slot, or (upscale) the same picture
// at full size. Either way the picture is uploaded, so the
// rule is checked here, in the one function that can send it, as well as by
// whoever calls it. Undefined when the OpenAI key is not set.
export function createSlotImageRegenerator(env: ImageAiEnv, fetchImpl: FetchLike = fetch): SlotImageRegenerator | undefined {
  if (!readImageAiConfigStatus(env).isConfigured) return undefined;
  const config = getImageAiConfig(env);
  return async (input) => {
    assertNoRealChildren(input.image, input.containsRealChildren);
    const prompt = input.upscale ? UPSCALE_PROMPT : buildRegenerationPrompt(input);
    const options = parseImageOptions({ prompt, size: SLOT_IMAGE_SIZE, quality: input.upscale ? UPSCALE_QUALITY : SLOT_IMAGE_QUALITY, format: "jpeg" });
    return { ...(await editImage(config, input.image, options, fetchImpl)), prompt };
  };
}
