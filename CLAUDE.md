# Rules for working on this app

## The AI model design

The user designed this. Follow it in every change that touches the AI, and do not deviate from it.

- There is one AI model, held in the `AI_CHAT_MODEL` variable. Every function uses that variable.
- Never call, pin or hard-code a particular model for a feature. If a model behaves badly for one task, change how it is called, for example `{ think: false }`. Never add a second model.
- `RECOMMENDED_AI_MODEL` in `src/ai/config.ts` is the only place a chat model is named. Claude recommends a model by changing it, and the user decides by pressing **Update AI model**. The app does not look for models by itself.
- The replaced model is kept only as the rollback model. Anything older is permanently deleted to free storage. At most two chat models are ever installed.
- The one named exception is the help search model, `AI_EMBED_MODEL` (`nomic-embed-text`). It cannot chat, runs on the CPU only, and does a job chat models can't do: Qwen3 refused with "this model does not support embeddings". It is its own variable, never a way to run a feature on a different chat model.
- The second named exception is AI images, which the user asked for on 2026-11-14: the image model `AI_IMAGE_MODEL` and the speech-to-text model `AI_TRANSCRIBE_MODEL`. Both are OpenAI models reached with `OPENAI_API_KEY`, not installed here, and they do jobs the chat model can't: draw a picture (from a description, or from a picture and a description) and hear a recording. They live in `src/image-ai`, are named only in `src/image-ai/config.ts`, and are never used to chat.
- No other exceptions.
- All models live in `.local/ollama-models`, set by `OLLAMA_MODELS` on every launch path, so they are stored once, not once per Windows account.
- `test/ai-model-design.test.ts` enforces this. Never loosen it to get a change through.

If a change seems to need something different, stop and ask the user first.

## Images of real children never go to OpenAI

The user set this on 2026-11-17 and refined it the same day: "we must never upload an image of real children".

- Before any picture is sent to OpenAI, the user is asked **"Does this image contain real children?"**. On "yes" it does not proceed. Only on "no" is it sent. A real photo of a kindergarten with no children in it may be sent this way.
- The **AI generated** flag (`OnePagerImage.aiGenerated`, the tick box) is what skips the question: an AI generated picture has no real children in it.
- The flag is set two ways (the user changed this on 2026-11-18: "The AI generated flag is also a user input, but it is also set when AI generation occurs"):
  - automatically, where the AI's own picture is stored (`storeAiPicture`);
  - by the user, with the tick box on the photo card (`POST .../images/:slot/ai-generated`). A photo the user ticks skips the question, the same as one the app generated.
- An upload or an import always starts unflagged. Nothing but those two ways sets the flag.
- Any code that sends a picture to OpenAI must call `assertNoRealChildren(image, answer)` (`src/image-ai/photo-slot.ts`) first. It passes only for a flagged picture or the answer `"no"`.
- Code that holds the photos (`src/one-pager`) does not call OpenAI itself. It is handed functions from `src/image-ai`.
- When writing a request for children in a picture, describe them (a mix of New Zealand children, about half Polynesian New Zealanders, in ordinary modern clothes) and do not use the word "Māori": image models answer it with historical costume. `buildRegenerationPrompt` does this.
- `test/one-pager.test.ts` ("AI images: ...", "Regenerate: ...") enforces this. Never loosen it to get a change through.
