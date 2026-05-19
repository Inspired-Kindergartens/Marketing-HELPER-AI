# AI Capability Plan

This plan adds offline AI capability to the local Marketing Helper AI webapp without changing its local-only security posture.

## Target Architecture

- Local model runtime: Ollama first, with room for llama.cpp/OpenAI-compatible local servers later.
- App data context: structured JSON from Prisma-backed Infocare analytics, Meta Ads, Google Analytics, centre contacts, and recommendation notes.
- RAG: local documents and advert files indexed into a local vector store after the first chat slice is working.
- Action layer: narrow, approval-based tools for notes, drafts, Microsoft 365 tasks/calendar/email, and local advert file work.
- Voice: optional local speech-to-text and text-to-speech after text chat and action approvals are stable.

## Phase 1: Offline Dashboard Chat

- Add local AI configuration through `.env`.
- Add a small local-model client.
- Build a compact dashboard context for the selected centre and priority centres.
- Enable the existing AI Chat composer.
- Add `/api/ai/chat` for question/answer against current dashboard data.
- Return setup errors clearly when the local model server is unavailable.

## Phase 2: Local RAG

- Add an approved local file root for marketing/ad documents.
- Index Markdown, text, CSV, JSON, and HTML documents with local embeddings.
- Store chunks and metadata in Postgres with `pgvector`, or use Qdrant if vector search needs to be separate.
- Add citations in AI answers so users can see which data/docs were used.
- Add advert brief and copy-drafting flows.

## Phase 3: Approved Actions

- Add action proposals as structured JSON separate from the natural-language response.
- Support user-approved actions:
  - create recommendation note,
  - draft centre email,
  - export report,
  - generate advert brief,
  - flag centre for review.
- Persist accepted actions in app history.

## Phase 4: Microsoft 365

- Use Microsoft Graph with delegated user auth.
- Start read-only for Outlook/calendar context.
- Add draft-first workflows before sending or editing:
  - find relevant Outlook email threads,
  - draft replies,
  - create To Do/Planner tasks,
  - read calendar availability,
  - create or edit calendar events after confirmation.
- Keep Microsoft 365 tools narrow and auditable.

## Phase 5: MCP And Voice

- Expose app tools through an MCP server once internal tool contracts are stable.
- Add a Microsoft 365 MCP wrapper only for approved Graph workflows.
- Add local speech-to-text and text-to-speech:
  - Whisper.cpp or equivalent for transcription,
  - Piper, Coqui, or Windows voices for responses,
  - transcript preview before execution.

## Current Implementation Slice

The first implementation should answer practical questions using current app data:

- Which centres need marketing attention?
- Why is a centre ranked high?
- Which centres need ads or spend review?
- What should the next follow-up action be?
- Draft a short advert/email direction for the selected centre.

The model may suggest actions, but anything that writes to files, sends mail, edits calendar entries, or changes Microsoft 365 data must remain a separate explicit approval step.
