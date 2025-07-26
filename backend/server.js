require('dotenv').config();
const express = require('express');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const cors = require('cors');
const fetch = require('node-fetch');
const FormData = require('form-data');
const admin = require('firebase-admin');
const { getDayOfYear } = require('date-fns');
const { v4: uuidv4 } = require('uuid'); // Added for unique filenames

const app = express();
const port = process.env.PORT || 3000;
app.use(cors());
app.use(express.json());

// Initialize Firebase Admin
try {
    const serviceAccount = require('./serviceAccountKey.json');
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        storageBucket: "sipwise-89d46.firebasestorage.app" // Add this line with your bucket URL
    });
} catch (error) {
    console.error("CRITICAL: serviceAccountKey.json not found or invalid. Please ensure the file is in the root directory.");
    process.exit(1);
}
const db = admin.firestore();

// --- API Key Configuration for THREE services ---
const GEMINI_API_KEY = process.env.API_KEY; // For the Quiz
const STABILITY_API_KEY = process.env.STABILITY_API_KEY; // For Images
const HEALTH_AI_API_KEY = process.env.HEALTH_AI_API_KEY; // For Health AI Chat

if (!GEMINI_API_KEY) {
    console.error("Gemini API key (API_KEY) not found. Please check your .env file.");
    process.exit(1);
}
if (!HEALTH_AI_API_KEY) {
    console.error("Health AI Gemini key (HEALTH_AI_API_KEY) not found. Please check your .env file.");
    process.exit(1);
}

// --- Create TWO separate Gemini instances ---
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY); // Original instance for the Quiz
const healthGenAI = new GoogleGenerativeAI(HEALTH_AI_API_KEY); // New instance for the Health AI

// --- AI Model Endpoints (Existing Quiz Logic) ---
app.post('/api/quiz-master', async (req, res) => {
    const { stage, userAnswers, difficulty, incorrectQuestions } = req.body;

    if (!stage) {
        return res.status(400).json({ error: 'Stage is required.' });
    }

    try {
        let prompt;
        let requiresJson = false;
        switch (stage) {
            case 'get_fact_of_the_day':
                prompt = "You are a health and wellness expert. Provide a single, surprising, and concise 'Fact of the Day' related to hydration, beverages, or nutrition in India. Make it engaging and easy to understand. Respond with only the fact as plain text.";
                break;
            case 'start_interview':
                const answerCount = userAnswers.length;
                if (answerCount === 0)
                    prompt = "You are a friendly health coach. Ask the very first of three personal questions about a user's typical daily drink choices. Ask only one question and keep it brief and engaging.";
                else if (answerCount === 1)
                    prompt = `The user answered '${userAnswers[0]}'. Now, ask a second, different personal question about *why* or *when* they make that drink choice. Ask only one question.`;
                else
                    prompt = `The user's previous answers are '${userAnswers.join(', ')}'. Now, ask the third and final personal question about what healthy changes they might be interested in. Ask only one question.`;
                break;
            case 'generate_quiz':
                requiresJson = true;
                prompt = `
A user with preferences: "${userAnswers.join('. ')}" has selected the '${difficulty}' difficulty level. You are an expert quiz creator for an Indian audience. Generate a quiz about health, drinks, and nutrition. **DIFFICULTY RULES:** - If '${difficulty}' is 'Easy': Ask common-knowledge questions. - If '${difficulty}' is 'Medium': Ask more specific questions involving numbers or common ingredients. - If '${difficulty}' is 'Hard': Ask complex, scientific, or data-driven questions. **CRITICAL RULES:** 1. **NO REPETITION:** Each quiz must feel completely fresh. 2. **VARY QUESTION STRUCTURE:** Mix up the formats. 3. **PLAUSIBLE DISTRACTORS:** Incorrect answers must be well-thought-out. Generate a quiz with exactly 8 questions. Each question must be an object with: - "questionText": the question string, - "answers": an array of 4 options, - "correctAnswerIndex": the index (0 to 3) of the correct answer in the "answers" array. Respond with a single JSON object with one key: 'quiz', whose value is an array of these question objects.`;
                break;
            case 'explain_wrong_answers':
                requiresJson = true;
                prompt = `You are a helpful health expert. For each question in this list: ${JSON.stringify(incorrectQuestions.map(q => ({ question: q.questionText, correctAnswer: q.answers[q.correctAnswerIndex] })))}, provide a clear, concise explanation. Respond with a single JSON object with one key: 'explanations', an array of objects, each with 'question' and 'explanation' keys.`;
                break;
            default:
                return res.status(400).json({ error: 'Invalid stage provided.' });
        }
        
        const model = genAI.getGenerativeModel({ // Uses the original genAI instance
            model: "gemini-1.5-flash",
            generationConfig: {
                temperature: 0.5,
                maxOutputTokens: 2048,
                response_mime_type: requiresJson ? "application/json" : "text/plain",
            }
        });
        
        const result = await model.generateContent(prompt);
        const responseText = result.response.text();
        
        if (requiresJson) {
            res.status(200).json(JSON.parse(responseText));
        } else {
            res.setHeader('Content-Type', 'text/plain').send(responseText);
        }
    } catch (error) {
        console.error("Error processing Google AI response:", error);
        res.status(500).json({ error: 'Failed to process the AI response. Check server logs.' });
    }
});

// --- Health AI Chatbot Endpoint ---
app.post('/api/health-ai', async (req, res) => {
    // This code remains unchanged
    const { history } = req.body;
    const userMessageCount = (history || []).filter(item => item.role === 'user').length;
    const isFinalQuestion = userMessageCount >= 10;
    const basePrompt = `You are a friendly and empathetic Health AI assistant named SipWise AI. Your goal is to understand a user's general health and wellness habits by asking a series of up to 10 conversational questions. You must never give direct medical advice. Instead, provide general wellness tips, suggest positive lifestyle changes, and strongly recommend consulting a doctor for any personal health problems. Your tone should be supportive and encouraging.`;
    let finalPrompt;
    if (isFinalQuestion) {
        finalPrompt = `${basePrompt} The 10-question interview is now complete. Based on the entire conversation history, act as an expert wellness coach and provide a comprehensive, detailed, and encouraging wellness summary for the user. Structure your response using markdown with the following sections:\n\n### Overall Wellness Summary\nProvide an insightful paragraph summarizing the user's current lifestyle and habits based on their answers.\n\n### Key Areas for Improvement\nCreate a bulleted list highlighting 2-3 specific areas where the user could focus their efforts (e.g., "Consistent Hydration," "Reducing Processed Sugar," "Evening Routine").\n\n### Detailed Suggestions & Rationale\nFor each 'Key Area' you identified, provide a detailed section with 2-3 actionable, non-prescriptive suggestions. For each suggestion, briefly explain the 'Why' behind it, referencing general wellness principles. For example, if you suggest drinking more water, explain how it aids digestion and energy levels.\n\n### A Positive Outlook\nEnd with an encouraging paragraph that reinforces positive habits the user may have mentioned and motivates them to start with small, manageable changes.\n\n**CRITICAL:** You must not provide any medical advice, diagnoses, or prescriptions. All suggestions must be general lifestyle tips. At the very end of your entire response, you must include the following disclaimer, exactly as written: "*Disclaimer: This is an AI-generated wellness summary, not medical advice. Please consult a healthcare professional for any health concerns.*"`;
    } else if (!history || history.length === 0) {
        finalPrompt = `${basePrompt} Start the conversation by introducing yourself and asking the very first question about the user's primary wellness goal or concern.`;
    } else {
        finalPrompt = `${basePrompt} This is the conversation so far. Continue it by asking the next relevant question to better understand the user's lifestyle. Ask only one question per turn.`;
    }
    try {
        const model = healthGenAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const chat = model.startChat({ history: [{ role: "user", parts: [{ text: finalPrompt }] }, { role: "model", parts: [{ text: "Understood. I will follow all instructions." }] }, ...(history || [])] });
        const result = await chat.sendMessage("Continue.");
        const responseText = result.response.text();
        res.status(200).json({ response: responseText, isFinal: isFinalQuestion });
    } catch (error) {
        console.error("Error in Health AI endpoint:", error);
        res.status(500).json({ error: 'Failed to get a response from the Health AI.' });
    }
});

// --- MODIFIED: Image Generation Endpoint ---
// REPLACE the entire '/api/generate-real-image' endpoint with this new version
app.post('/api/generate-real-image', async (req, res) => {
    const { userPrompt, uid } = req.body;
    if (!userPrompt) return res.status(400).json({ error: 'A text prompt is required.' });
    if (!STABILITY_API_KEY) return res.status(500).json({ error: 'Stability AI API key not configured.' });

    try {
        const formData = new FormData();
        formData.append('prompt', userPrompt);
        formData.append('model', 'sd3');
        formData.append('aspect_ratio', '1:1');
        formData.append('output_format', 'jpeg');

        const response = await fetch(
            "https://api.stability.ai/v2beta/stable-image/generate/sd3",
            {
                method: 'POST',
                // --- MODIFICATION: Corrected the headers object ---
                // We let node-fetch handle the Content-Type header from the formData body
                // and explicitly set the Accept header as required by the API.
                headers: {
                    'Authorization': `Bearer ${STABILITY_API_KEY}`,
                    'Accept': 'application/json'
                },
                body: formData,
            }
        );

        if (!response.ok) {
            const errorDetails = await response.text();
            console.error(`--- STABILITY AI FAILED ---`);
            console.error(`Status: ${response.status} ${response.statusText}`);
            console.error(`Error Details from AI: ${errorDetails}`);
            console.error(`--- END OF ERROR ---`);
            // Pass the specific error from the API to the frontend
            throw new Error(`Image generation failed: ${errorDetails}`);
        }
        
        const data = await response.json();
        
        const bucket = admin.storage().bucket();
        const imageBuffer = Buffer.from(data.image, 'base64');
        const fileName = `images/${uid || 'public'}/${uuidv4()}.jpeg`;
        const file = bucket.file(fileName);

        await file.save(imageBuffer, {
            metadata: { contentType: 'image/jpeg' },
            public: true,
        });

        const publicUrl = file.publicUrl();

        if (uid) {
            const userRef = db.collection('users').doc(uid);
            await userRef.set({
                imageGallery: admin.firestore.FieldValue.arrayUnion(publicUrl)
            }, { merge: true });
        }

        res.status(200).json({ imageUrl: publicUrl });

    } catch (error) {
        console.error("Error in /api/generate-real-image route:", error.message);
        res.status(500).json({ error: error.message });
    }
});



// --- Daily Challenge & Leaderboard Endpoints ---
const dailyChallenges = [
    { title: "Hydration Hero", description: "Drink 8 glasses of water today.", points: 20 },
    { title: "Sugar Swap", description: "Swap one sugary soda for a healthy alternative like lemon water or unsweetened tea.", points: 30 },
    { title: "Move Your Body", description: "Do 20 minutes of light exercise like walking or stretching.", points: 25 },
    { title: "Mindful Sipping", description: "Take a moment to read the ingredients list on a beverage you drink today.", points: 15 },
    { title: "Fruit Power", description: "Eat one whole fruit instead of drinking a packaged juice.", points: 25 },
    { title: "Share the Knowledge", description: "Share one health fact you learned from SipWise with a friend or family member.", points: 20 },
    { title: "Early Bird Hydration", description: "Drink a glass of water within 10 minutes of waking up.", points: 15 }
];
app.get('/api/daily-challenge', (req, res) => {
    // This existing code remains unchanged
    const dayIndex = getDayOfYear(new Date()) % dailyChallenges.length;
    const challenge = dailyChallenges[dayIndex];
    res.status(200).json(challenge);
});
app.post('/api/complete-challenge', async (req, res) => {
    // This existing code remains unchanged
    try {
        const { uid } = req.body;
        if (!uid) return res.status(400).json({ error: 'User ID is required.' });
        const today = new Date().toISOString().split('T')[0];
        const userRef = db.collection('users').doc(uid);
        const doc = await userRef.get();
        if (!doc.exists) return res.status(404).json({ error: 'User not found.' });
        const userData = doc.data();
        if (userData.lastChallengeCompleted === today) {
            return res.status(409).json({ error: 'Challenge already completed today.' });
        }
        const dayIndex = getDayOfYear(new Date()) % dailyChallenges.length;
        const challenge = dailyChallenges[dayIndex];
        const newPoints = (userData.hydroPoints || 0) + challenge.points;
        await userRef.set({ hydroPoints: newPoints, lastChallengeCompleted: today }, { merge: true });
        res.status(200).json({ success: true, pointsAwarded: challenge.points, newTotal: newPoints });
    } catch (error) {
        console.error("Error completing challenge:", error);
        res.status(500).json({ error: 'Failed to complete challenge.' });
    }
});
app.get('/api/leaderboard', async (req, res) => {
    // This existing code remains unchanged
    try {
        const usersSnapshot = await db.collection('users').orderBy('hydroPoints', 'desc').limit(10).get();
        const leaderboard = usersSnapshot.docs.map(doc => {
            const data = doc.data();
            return { uid: doc.id, displayName: data.displayName || 'Anonymous', photoURL: data.photoURL || 'https://i.ibb.co/6yvC0rT/default-avatar.png', hydroPoints: data.hydroPoints || 0 };
        });
        res.status(200).json(leaderboard);
    } catch (error) {
        console.error("Error fetching leaderboard:", error);
        res.status(500).json({ error: 'Failed to fetch leaderboard.' });
    }
});

// --- Firestore Points Endpoints ---
app.get('/api/points/:uid', async (req, res) => {
    // This existing code remains unchanged
    try {
        const uid = req.params.uid;
        const userRef = db.collection('users').doc(uid);
        const doc = await userRef.get();
        if (!doc.exists) {
            await userRef.set({ hydroPoints: 0 });
            res.status(200).json({ hydroPoints: 0 });
        } else {
            res.status(200).json(doc.data());
        }
    } catch (error) {
        if (error.code === 5) {
            console.error("FATAL Firestore Error (code 5 NOT_FOUND): The database was not found. Have you created a Firestore database in your Firebase project console?");
        }
        console.error("Error fetching points:", error);
        res.status(500).json({ error: 'Failed to fetch points.' });
    }
});
app.post('/api/points', async (req, res) => {
    // This existing code remains unchanged
    try {
        const { uid, points } = req.body;
        if (!uid || points === undefined) return res.status(400).json({ error: 'User ID and points are required.' });
        const userRef = db.collection('users').doc(uid);
        await userRef.set({ hydroPoints: points }, { merge: true });
        res.status(200).json({ success: true, newTotal: points });
    } catch (error) {
        console.error("Error updating points:", error);
        res.status(500).json({ error: 'Failed to update points.' });
    }
});

// --- Activity and Personalization Endpoints ---
app.post('/api/activity/quiz', async (req, res) => {
    // This existing code remains unchanged
    try {
        const { uid, quizData } = req.body;
        if (!uid || !quizData) return res.status(400).json({ error: 'User ID and quiz data are required.' });
        const historyEntry = { ...quizData, timestamp: new Date() };
        await db.collection('users').doc(uid).collection('quizHistory').add(historyEntry);
        res.status(200).json({ success: true });
    } catch (error) {
        console.error("Error saving quiz history:", error);
        res.status(500).json({ error: 'Failed to save quiz history.' });
    }
});
app.post('/api/activity/interview-answers', async (req, res) => {
    // This existing code remains unchanged
    try {
        const { uid, answers } = req.body;
        if (!uid || !answers) return res.status(400).json({ error: 'User ID and answers are required.' });
        await db.collection('users').doc(uid).set({ interviewAnswers: answers }, { merge: true });
        res.status(200).json({ success: true });
    } catch (error) {
        if (error.code === 5) {
            console.error("FATAL Firestore Error (code 5 NOT_FOUND): The database was not found. Have you created a Firestore database in your Firebase project console?");
        }
        console.error("Error saving interview answers:", error);
        res.status(500).json({ error: 'Failed to save answers.' });
    }
});
app.get('/api/activity/quiz-history/:uid', async (req, res) => {
    // This existing code remains unchanged
    try {
        const uid = req.params.uid;
        const historySnapshot = await db.collection('users').doc(uid).collection('quizHistory').orderBy('timestamp', 'desc').limit(10).get();
        const history = historySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.status(200).json(history);
    } catch (error) {
        console.error("Error fetching quiz history:", error);
        res.status(500).json({ error: 'Failed to fetch quiz history.' });
    }
});
app.get('/api/activity/health-tips/:uid', async (req, res) => {
    // This existing code remains unchanged
    try {
        const uid = req.params.uid;
        const userDoc = await db.collection('users').doc(uid).get();
        if (!userDoc.exists || !userDoc.data().interviewAnswers) {
            return res.status(404).json({ error: 'Interview answers not found for user.' });
        }
        const answers = userDoc.data().interviewAnswers;
        const model = healthGenAI.getGenerativeModel({ // Uses the new healthGenAI instance
            model: "gemini-1.5-flash",
            generationConfig: { temperature: 0.5, maxOutputTokens: 256, response_mime_type: "application/json", }
        });
        const prompt = `Based on these user statements about their drink habits in India ("${answers.join('; ')}"), generate 3 short, actionable, and personalized health tips. Respond only with a single JSON object with one key: "tips", which is an array of 3 tip strings.`;
        const result = await model.generateContent(prompt);
        const responseText = result.response.text();
        res.status(200).json(JSON.parse(responseText));
    } catch (error) {
        console.error("Error generating health tips:", error);
        res.status(500).json({ error: 'Failed to generate health tips.' });
    }
});

app.listen(port, () => {
    console.log(`✅ AI Server is running and listening at http://localhost:${port}`);
});