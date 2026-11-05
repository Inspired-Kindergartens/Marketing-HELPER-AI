# Rules for working on this app

## The AI model design

The user designed this. Follow it in every change that touches the AI, and do not deviate from it.

- There is one AI model, held in the `AI_CHAT_MODEL` variable. Every function uses that variable.
- Never call, pin or hard-code a particular model for a feature. If a model behaves badly for one task, change how it is called, for example `{ think: false }`. Never add a second model.
- `RECOMMENDED_AI_MODEL` in `src/ai/config.ts` is the only place a chat model is named. Claude recommends a model by changing it, and the user decides by pressing **Update AI model**. The app does not look for models by itself.
- The replaced model is kept only as the rollback model. Anything older is permanently deleted to free storage. At most two chat models are ever installed.
- The one named exception is the help search model, `AI_EMBED_MODEL` (`nomic-embed-text`). It cannot chat, runs on the CPU only, and does a job chat models can't do: Qwen3 refused with "this model does not support embeddings". It is its own variable, never a way to run a feature on a different chat model. No other exceptions.
- All models live in `.local/ollama-models`, set by `OLLAMA_MODELS` on every launch path, so they are stored once, not once per Windows account.
- `test/ai-model-design.test.ts` enforces this. Never loosen it to get a change through.

If a change seems to need something different, stop and ask the user first.
