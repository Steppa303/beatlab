import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import {
  GoogleGenAI,
  type LiveMusicSession,
  type LiveMusicServerMessage,
  // ErrorEvent and CloseEvent types are assumed to be resolved in the project's context.
  // If they are from the DOM, their direct usage in Node might need specific polyfills or types.
} from '@google/genai';

const app = express();
const port = process.env.PORT || 3000;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  console.error(
    'FATAL ERROR: GEMINI_API_KEY environment variable is not set.',
  );
  process.exit(1); // This is standard Node.js; TS error indicates a @types/node setup issue.
}

const ai = new GoogleGenAI({
  apiKey: GEMINI_API_KEY,
  apiVersion: 'v1alpha', // Assuming this is correct and required for Lyria model
});
const modelName = 'lyria-realtime-exp';

let session: LiveMusicSession | undefined;
let clientResponse: Response | undefined; // Express Response object for SSE

app.use(express.json()); // Middleware to parse JSON request bodies

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));


function sendSseMessage(data: object) {
  if (clientResponse) {
    clientResponse.write(`data: ${JSON.stringify(data)}\n\n`);
  }
}

async function initializeLyriaSession() {
  if (session) {
    try {
      // Based on error "Property 'catch' does not exist on type 'void'" for session.close().catch(),
      // session.close() is assumed to return void.
      session.close();
      console.log('Closed existing Lyria session.');
    } catch (e) {
      // If session.close() can throw synchronously
      console.warn('Error closing existing Lyria session:', e);
    }
    session = undefined;
  }

  console.log('Attempting to connect to Lyria...');
  try {
    session = await ai.live.music.connect({
      model: modelName,
      callbacks: {
        onmessage: (e: LiveMusicServerMessage) => {
          if (e.serverContent?.audioChunks?.[0]?.data) {
            sendSseMessage({
              type: 'audioChunk',
              audioDataB64: e.serverContent.audioChunks[0].data,
            });
          }
          if (e.setupComplete) {
            console.log('Lyria session setup complete.');
            sendSseMessage({ type: 'playbackState', state: 'loading', message: 'Lyria connected.' });
          }
          if (e.filteredPrompt) {
             sendSseMessage({ type: 'info', message: `Prompt filtered: ${e.filteredPrompt.filteredReason}` });
          }
        },
        onerror: (e: ErrorEvent | {message: string}) => { // ErrorEvent might need specific typing in Node
          const errorMessage = (e as {message: string}).message || (e as ErrorEvent)?.type || 'Unknown Lyria error';
          console.error('Lyria session error:', errorMessage);
          sendSseMessage({ type: 'error', message: `Lyria error: ${errorMessage}` });
          closeLyriaSessionAndStream();
        },
        onclose: (/*e: CloseEvent*/) => { // CloseEvent is typically a browser type. Parameter 'e' might be problematic.
          // console.log('Lyria connection closed.', (e as CloseEvent)?.reason);
          console.log('Lyria connection closed.'); // Simplified log
           if (clientResponse) {
            sendSseMessage({ type: 'playbackState', state: 'stopped', message: 'Lyria connection closed.' });
          }
          closeLyriaSessionAndStream();
        },
      },
    });
    console.log('Lyria session initialized.');
    return true;
  } catch (error) {
    console.error('Failed to initialize Lyria session:', error);
    sendSseMessage({ type: 'error', message: `Failed to connect to Lyria: ${(error as Error).message}` });
    return false;
  }
}

function closeLyriaSessionAndStream() {
    if (session) {
        try {
            // session.close() is assumed to return void.
            session.close();
        } catch (e) {
            // If session.close() can throw synchronously
            console.warn("Error closing Lyria session on cleanup:", e);
        }
        session = undefined;
        console.log("Lyria session explicitly closed during cleanup.");
    }
    if (clientResponse) {
        clientResponse.end();
        clientResponse = undefined;
        console.log("SSE stream ended.");
    }
}

// Define an interface for the expected request body for type safety
interface LyriaControlRequestBody {
  action: 'play' | 'pause' | 'stop' | 'setPrompt';
  prompt?: string;
}

app.post('/api/lyria/control', async (req: Request<{}, any, LyriaControlRequestBody>, res: Response) => {
  const {action, prompt} = req.body; // req.body should be typed by LyriaControlRequestBody
  console.log(`Control action: ${action}, prompt: ${prompt}`);

  if (action === 'play') {
    // Check if session is undefined (i.e., not active or closed)
    if (!session) {
      const success = await initializeLyriaSession();
      if (!success || !session) { // Re-check session as initialization might fail
        return res.status(500).json({message: 'Failed to initialize Lyria session.'});
      }
    }
    // At this point, session should be valid if initialization succeeded
    try {
      if (prompt && session) { // Ensure session is not undefined before using
        await session.setWeightedPrompts({weightedPrompts: [{text: prompt, weight: 1.0}]});
        console.log('Prompt set:', prompt);
      }
      if (session) { // Ensure session is not undefined
        await session.play();
        sendSseMessage({ type: 'playbackState', state: 'playing' });
        res.json({success: true, message: 'Playback started/resumed.'});
      } else {
        // Should not happen if logic above is correct, but as a safeguard:
        res.status(500).json({message: 'Lyria session is not available.'});
      }
    } catch (e) {
      console.error('Error on play/prompt:', e);
      res.status(500).json({message: `Error starting playback: ${(e as Error).message}`});
    }
  } else if (action === 'pause') {
    // Check if session is active
    if (session) {
      await session.pause();
      sendSseMessage({ type: 'playbackState', state: 'paused' });
      res.json({success: true, message: 'Playback paused.'});
    } else {
      res.status(400).json({message: 'No active session to pause.'});
    }
  } else if (action === 'stop') {
    if (session) {
        await session.stop(); // stop might also trigger onclose which calls closeLyriaSessionAndStream
    }
    closeLyriaSessionAndStream(); // Ensure cleanup regardless
    res.json({success: true, message: 'Playback stopped and session closed.'});
  } else if (action === 'setPrompt') {
    // Check if session is active and prompt is provided
    if (session && prompt) {
      try {
        await session.setWeightedPrompts({weightedPrompts: [{text: prompt, weight: 1.0}]});
        console.log('Prompt updated:', prompt);
        res.json({success: true, message: 'Prompt updated.'});
      } catch (e) {
        console.error('Error setting prompt:', e);
        res.status(500).json({message: `Error setting prompt: ${(e as Error).message}`});
      }
    } else {
      res.status(400).json({message: 'No active session or prompt provided.'});
    }
  } else {
    res.status(400).json({message: 'Invalid action.'});
  }
});

app.get('/api/lyria/stream', (req: Request, res: Response) => {
  if (clientResponse) {
    clientResponse.end();
    console.log("Replaced existing SSE client with new one.");
  }

  clientResponse = res;
  clientResponse.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });
  console.log('Client connected for SSE audio stream.');

  // Check if session is active
  if (session) {
     sendSseMessage({ type: 'playbackState', state: 'loading', message: 'Connected to active Lyria stream.' });
  } else {
     sendSseMessage({ type: 'info', message: 'SSE connected. Send play command to start music.' });
  }

  req.on('close', () => {
    console.log('SSE client disconnected.');
    // Only clear clientResponse if it's the one that disconnected
    if (clientResponse === res) {
        clientResponse = undefined;
    }
  });
});

// Fallback to index.html for SPA routing
app.get('*', (req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});
