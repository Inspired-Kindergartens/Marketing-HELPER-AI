# Knowledge drop folders

Documents in these folders are indexed into the help knowledge base (RAG) that the AI chats search when answering questions. One folder per source:

- `infocare/`: Infocare guides, manuals, how the dashboard reads Infocare
- `meta/`: Meta Ads help, for example Meta help-centre pages saved from your browser
- `google-analytics/`: Google Analytics guides
- `mailchimp/`: Mailchimp guides

Supported files: `.md`, `.txt`, `.html` / `.htm` and `.pdf`. Documents are split on their headings, so well-headed documents give the best answers.

The server re-reads these folders daily, and also after a restart. An unchanged file is not re-processed; a deleted file is removed from the index.

Meta's own help centre blocks automated crawling, so Meta help pages can only be added here by hand (in your browser, use Save page as, "Webpage, HTML only"). Infocare has no public help centre, so its manuals also belong here.
