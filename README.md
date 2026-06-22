# WhiteBoardDefense

AI-assisted whiteboard defense platform for verifying genuine student 
understanding of research papers.

## Supported AI Providers
- OpenAI (gpt-4o-mini)
- Claude (claude-haiku-4-5-20251001)
- Google Gemini (gemini-2.0-flash)

## Setup
1. `npm install`
2. Copy `.env.example` to `.env` and add your API key
3. Set `AI_PROVIDER=openai`, `claude`, or `gemini` in `.env`
4. `npm run build`
5. `node dist/server.cjs`

## IIS Deployment
See DEPLOYMENT_GUIDE.md for full Windows Server 2025 / IIS setup instructions.