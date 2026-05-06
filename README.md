# AutoScribe AI 🚀

Smart Lecture Summarizer powered by Groq AI + Llama 3.3

## Project Structure

```
autoscribe-ai/
├── public/
│   ├── index.html     ← Main HTML file
│   ├── styles.css     ← All CSS styles
│   └── app.js         ← All JavaScript logic
├── api/
│   └── groq.js        ← Vercel serverless backend (keeps API key secure)
├── vercel.json        ← Vercel configuration
└── README.md
```

## How to Deploy on Vercel

1. Push this folder to GitHub
2. Go to vercel.com → Import your repo
3. Go to **Settings → Environment Variables**
4. Add:
   - Key: `GROQ_API_KEY`
   - Value: your Groq API key from console.groq.com
5. Click **Save** then **Redeploy**

## Why This Structure?

- API key is stored securely in Vercel (not in your code)
- `/api/groq.js` acts as a backend that calls Groq on the server
- Browser never sees the API key 🔒
