import { GEMINI_API_KEY, GEMINI_API_URL } from './config.js';

// We'll add JavaScript functionality in later steps
console.log('AI Quiz Generator initialized'); 

// Store quiz data
let currentQuiz = {
    questions: [],
    answers: {}, // Change to object to store answers by question number
    originalText: '', // Store the original text for generating similar quizzes
    flaggedQuestions: new Set(), // Store flagged question numbers
    settings: {} // Store current quiz settings
};

// DOM Elements
const quizForm = document.getElementById('quizForm');
const textInput = document.getElementById('textInput');
const fileInput = document.getElementById('fileInput');
const questionCount = document.getElementById('questionCount');
const quizSection = document.getElementById('quizSection');
const quizQuestions = document.getElementById('quizQuestions');
const submitQuizBtn = document.getElementById('submitQuiz');
const resultsSection = document.getElementById('resultsSection');
const resultsContainer = document.getElementById('resultsContainer');
const newQuizBtn = document.getElementById('newQuiz');
const difficultyLevel = document.getElementById('difficultyLevel');
const loadingScreen = document.getElementById('loadingScreen');
const themeToggle = document.getElementById('themeToggle');
const questionType = document.getElementById('questionType');
const timerToggle = document.getElementById('timerToggle');
const timerSettings = document.getElementById('timerSettings');
const timerMinutes = document.getElementById('timerMinutes');
const viewMode = document.getElementById('viewMode');
const aboutBtn = document.getElementById('aboutBtn');
const aboutModal = document.getElementById('aboutModal');
const closeBtn = aboutModal.querySelector('.close-btn');
let timerInterval;
let timeLeft;
let currentQuestionIndex = 0;

// Handle file input
fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
        const formGroup = fileInput.closest('.form-group');
        formGroup.classList.add('loading');

        let text;
        if (file.type === 'application/pdf') {
            text = await extractTextFromPDF(file);
        } else {
            text = await file.text();
        }
        textInput.value = text;

        const fileName = file.name || 'No file chosen';
        e.target.parentElement.querySelector('.file-name').textContent = fileName;

        formGroup.classList.remove('loading');
    } catch (error) {
        console.error('Error reading file:', error);
        showNotification('Error reading file: ' + error.message, 'error');
        fileInput.value = ''; // Clear the file input
        formGroup.classList.remove('loading');
    }
});

// Add function to extract text from PDF
async function extractTextFromPDF(file) {
    try {
        const arrayBuffer = await file.arrayBuffer();
        
        // Use the global pdfjsLib variable
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        
        let fullText = '';
        
        // Extract text from each page
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(' ');
            fullText += pageText + '\n';
        }
        
        return fullText.trim();
    } catch (error) {
        console.error('Error extracting PDF text:', error);
        throw new Error('Could not read PDF file. Please make sure it\'s a valid PDF document.');
    }
}

// Update the form submission handler
quizForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    storeQuizSettings(); // Store settings when generating initial quiz
    
    const text = textInput.value.trim();
    const numQuestions = parseInt(questionCount.value);
    
    if (!text) {
        showNotification('Please enter some text or upload a file', 'error');
        return;
    }
    
    if (isNaN(numQuestions) || numQuestions < 1 || numQuestions > 30) {
        showNotification('Please enter a valid number of questions (1-30)', 'error');
        return;
    }
    
    try {
        // Show loading screen
        loadingScreen.classList.remove('hidden');
        const generateBtn = document.getElementById('generateBtn');
        if (generateBtn) {
            generateBtn.disabled = true;
        }
        
        // Generate the quiz
        await generateQuiz(text, numQuestions);
        
        // Hide form and show quiz
        quizForm.classList.add('hidden');
        quizSection.classList.remove('hidden');
        
        // Start timer if enabled
        if (timerToggle.checked) {
            const duration = parseInt(timerMinutes.value);
            if (duration > 0) {
                startTimer(duration);
            }
        }
    } catch (error) {
        console.error('Quiz generation error:', error);
        showNotification('Error generating quiz: ' + error.message, 'error');
    } finally {
        // Hide loading screen and re-enable button
        loadingScreen.classList.add('hidden');
        const generateBtn = document.getElementById('generateBtn');
        if (generateBtn) {
            generateBtn.disabled = false;
        }
    }
});

// Update the displayQuestions function
function displayQuestions(questions) {
    currentQuiz.questions = questions;
    currentQuestionIndex = 0;
    
    if (viewMode.value === 'single') {
        displaySingleQuestion();
    } else {
        displayAllQuestions();
    }
}

// Update displaySingleQuestion to include progress dots
function displaySingleQuestion() {
    const question = currentQuiz.questions[currentQuestionIndex];
    const totalQuestions = currentQuiz.questions.length;
    const questionNumber = currentQuestionIndex + 1;
    
    // Create progress dots
    let progressDotsHTML = '<div class="progress-indicator">';
    for (let i = 0; i < totalQuestions; i++) {
        const dotClass = i === currentQuestionIndex ? 'active' : 
                        i < currentQuestionIndex ? 'completed' : '';
        progressDotsHTML += `<div class="progress-dot ${dotClass}"></div>`;
    }
    progressDotsHTML += '</div>';

    quizQuestions.innerHTML = `
        <div class="progress-container">
            <div class="progress-text">
                <span>Question ${questionNumber} of ${totalQuestions}</span>
            </div>
            ${progressDotsHTML}
        </div>
        <div class="question-container">
            ${generateQuestionHTML(question, currentQuestionIndex)}
        </div>
        <div class="question-navigation">
            <button type="button" class="nav-btn" id="prevQuestion" ${currentQuestionIndex === 0 ? 'disabled' : ''}>
                Previous
            </button>
            <button type="button" class="nav-btn" id="reviewQuestions">Review All</button>
            <button type="button" class="nav-btn" id="nextQuestion">
                ${currentQuestionIndex === totalQuestions - 1 ? 'Finish Quiz' : 'Next'}
            </button>
        </div>
    `;

    // Add styles for the new elements
    const style = document.createElement('style');
    style.textContent = `
        .progress-container {
            margin: 20px 0;
            padding: 10px;
            background: #f5f5f5;
            border-radius: 8px;
            list-style-type: none;
        }
        .progress-container::before {
            display: none;
        }
        .progress-text {
            display: flex;
            justify-content: space-between;
            margin-bottom: 8px;
            color: #333;
            font-weight: 500;
            list-style: none;
        }
        .progress-bar {
            height: 8px;
            background: #e0e0e0;
            border-radius: 4px;
            overflow: hidden;
            list-style: none;
        }
        .progress-fill {
            height: 100%;
            background: linear-gradient(90deg, #4CAF50, #8BC34A);
            transition: width 0.3s ease;
        }
        .question-container {
            position: relative;
            padding: 1rem;
            background: var(--card-background);
            border-radius: var(--border-radius);
            border: 1px solid var(--border-color);
            margin-bottom: 1rem;
        }
        .question-text {
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
        }
        .difficulty-badge {
            background-color: var(--primary-color);
            color: white;
            padding: 0.25rem 0.5rem;
            border-radius: var(--border-radius);
        }
        .question-type-badge {
            background-color: var(--success-color);
            color: white;
            padding: 0.25rem 0.5rem;
            border-radius: var(--border-radius);
        }
        .options {
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
        }
        .option {
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }
        .option label {
            cursor: pointer;
        }
        .option input {
            cursor: pointer;
        }
        .question-navigation {
            display: flex;
            justify-content: space-between;
            gap: 1rem;
            margin-top: 2rem;
            padding: 1rem 0;
        }
        .nav-btn {
            padding: 0.75rem 1.5rem;
            background-color: var(--card-background);
            border: 2px solid var(--primary-color);
            color: var(--primary-color);
            border-radius: var(--border-radius);
            cursor: pointer;
            font-weight: 500;
            transition: all 0.2s ease;
            min-width: 140px;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 0.5rem;
        }
        .nav-btn::before,
        .nav-btn::after {
            content: '';
            width: 20px;
            height: 20px;
            background-position: center;
            background-repeat: no-repeat;
            opacity: 0.8;
        }
        #prevQuestion::before {
            background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%234B4EFC'%3E%3Cpath d='M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z'/%3E%3C/svg%3E");
        }
        #nextQuestion::after {
            background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%234B4EFC'%3E%3Cpath d='M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z'/%3E%3C/svg%3E");
        }
        .nav-btn:hover:not(:disabled) {
            background-color: var(--primary-color);
            color: white;
            transform: translateY(-2px);
            box-shadow: var(--shadow-sm);
        }
        .nav-btn:hover::before,
        .nav-btn:hover::after {
            filter: brightness(0) invert(1);
        }
        .nav-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
            border-color: var(--border-color);
            color: var(--text-secondary);
        }
        .nav-btn:disabled::before,
        .nav-btn:disabled::after {
            opacity: 0.3;
        }
        #reviewQuestions {
            background-color: var(--primary-color);
            color: white;
            border: none;
        }
        #reviewQuestions:hover {
            background-color: var(--primary-hover);
            transform: translateY(-2px);
            box-shadow: var(--shadow-sm);
        }
        /* Dark theme support */
        [data-theme="dark"] .nav-btn {
            background-color: var(--card-background);
            color: var(--primary-color);
        }
        [data-theme="dark"] .nav-btn:hover:not(:disabled) {
            background-color: var(--primary-color);
            color: white;
        }
        [data-theme="dark"] .nav-btn:disabled {
            border-color: var(--border-color);
            color: var(--text-secondary);
        }
        [data-theme="dark"] #reviewQuestions {
            background-color: var(--primary-color);
            color: white;
        }
        [data-theme="dark"] #reviewQuestions:hover {
            background-color: var(--primary-hover);
        }
        /* Add a progress indicator */
        .progress-indicator {
            display: flex;
            justify-content: center;
            gap: 0.5rem;
            margin: 1rem 0;
        }
        .progress-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background-color: var(--border-color);
            transition: all 0.2s ease;
        }
        .progress-dot.active {
            background-color: var(--primary-color);
            transform: scale(1.2);
        }
        .progress-dot.completed {
            background-color: var(--success-color);
        }
    `;
    document.head.appendChild(style);

    // Restore previous answer if it exists
    const savedAnswer = currentQuiz.answers[questionNumber];
    if (savedAnswer !== undefined) {
        if (question.type === 'multiple-choice') {
            const radioBtn = document.querySelector(`input[name="question${questionNumber}"][value="${savedAnswer}"]`);
            if (radioBtn) radioBtn.checked = true;
        } else {
            const textarea = document.querySelector(`#q${questionNumber}response`);
            if (textarea) textarea.value = savedAnswer;
        }
    }

    // Add navigation event listeners
    const prevBtn = document.getElementById('prevQuestion');
    const nextBtn = document.getElementById('nextQuestion');
    const reviewBtn = document.getElementById('reviewQuestions');

    prevBtn?.addEventListener('click', () => {
        saveCurrentAnswer();
        currentQuestionIndex--;
        displaySingleQuestion();
    });

    nextBtn?.addEventListener('click', () => {
        saveCurrentAnswer();
        if (currentQuestionIndex === totalQuestions - 1) {
            showReviewScreen();
        } else {
            currentQuestionIndex++;
            displaySingleQuestion();
        }
    });

    reviewBtn?.addEventListener('click', () => {
        saveCurrentAnswer();
        showReviewScreen();
    });
}

// Add function to toggle flag status
function toggleFlag(questionNumber) {
    // Save the current answer before toggling flag
    saveCurrentAnswer();
    
    if (currentQuiz.flaggedQuestions.has(questionNumber)) {
        currentQuiz.flaggedQuestions.delete(questionNumber);
    } else {
        currentQuiz.flaggedQuestions.add(questionNumber);
    }
    
    // Redisplay the question, which will restore the saved answer
    displaySingleQuestion();
}

// Add function to show review screen
function showReviewScreen() {
    saveCurrentAnswer();
    
    const totalQuestions = currentQuiz.questions.length;
    let reviewHTML = `
        <div class="review-screen">
            <h2>Review Questions</h2>
            <div class="questions-grid">
    `;
    
    for (let i = 0; i < totalQuestions; i++) {
        const questionNum = i + 1;
        const hasAnswer = currentQuiz.answers[questionNum] !== undefined;
        const isFlagged = currentQuiz.flaggedQuestions.has(questionNum);
        
        reviewHTML += `
            <div class="question-box ${isFlagged ? 'flagged' : ''}"
                 onclick="goToQuestion(${i})">
                <div class="question-number">Q${questionNum}</div>
                <div class="question-status">
                    ${isFlagged ? '🚩' : ''}
                </div>
            </div>
        `;
    }
    
    reviewHTML += `
            </div>
            <div class="review-info">
                <p>Click any question to review or modify your answer.</p>
                <p>Click the submit button when you're ready to finish the quiz.</p>
            </div>
        </div>
    `;
    
    quizQuestions.innerHTML = reviewHTML;
    
    // Add styles for review screen
    const style = document.createElement('style');
    style.textContent = `
        .review-screen {
            padding: 20px;
        }
        .questions-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
            gap: 15px;
            margin: 20px 0;
        }
        .question-box {
            padding: 15px;
            border-radius: 8px;
            background: #f5f5f5;
            cursor: pointer;
            transition: all 0.3s ease;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 5px;
            border: 2px solid transparent;
        }
        .question-box:hover {
            transform: translateY(-2px);
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            border-color: #2196F3;
        }
        .question-box.flagged {
            border: 2px solid #ff9800;
        }
        .question-number {
            font-weight: bold;
            color: #333;
        }
        .question-status {
            font-size: 0.9em;
            color: #666;
        }
        .review-info {
            margin-top: 20px;
            text-align: center;
            color: #666;
            font-size: 0.9em;
        }
    `;
    document.head.appendChild(style);
}

// Add function to navigate to specific question
function goToQuestion(index) {
    currentQuestionIndex = index;
    displaySingleQuestion();
}

// Make toggleFlag and goToQuestion available globally
window.toggleFlag = toggleFlag;
window.goToQuestion = goToQuestion;

// Add function to save current answer
function saveCurrentAnswer() {
    const questionNumber = currentQuestionIndex + 1;
    const question = currentQuiz.questions[currentQuestionIndex];
    
    if (question.type === 'multiple-choice') {
        const selectedOption = document.querySelector(`input[name="question${questionNumber}"]:checked`);
        if (selectedOption) {
            currentQuiz.answers[questionNumber] = selectedOption.value;
        }
    } else {
        const textarea = document.querySelector(`#q${questionNumber}response`);
        if (textarea) {
            currentQuiz.answers[questionNumber] = textarea.value;
        }
    }
}

// Add function to display all questions
function displayAllQuestions() {
    // Clear flagged questions when switching to all questions view
    currentQuiz.flaggedQuestions.clear();
    
    quizQuestions.innerHTML = currentQuiz.questions
        .map((question, index) => generateQuestionHTML(question, index))
        .join('');
}

// Update the generateQuestionHTML function to conditionally show the flag button
function generateQuestionHTML(question, index) {
    const questionNumber = index + 1;
    const isFlagged = currentQuiz.flaggedQuestions.has(questionNumber);
    const showFlag = viewMode.value === 'single';
    
    return `
        <div class="question-container">
            ${showFlag ? `
                <button class="flag-btn ${isFlagged ? 'flagged' : ''}" 
                        onclick="toggleFlag(${questionNumber})" 
                        title="${isFlagged ? 'Unflag Question' : 'Flag Question'}">
                    <svg viewBox="0 0 24 24">
                        <path d="${isFlagged ? 
                            'M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6z' : 
                            'M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6h-5.6z'}"/>
                    </svg>
                </button>
            ` : ''}
            <div class="question-content">
                ${question.type === 'multiple-choice' ? `
                    <div class="question-text">
                        <span class="difficulty-badge ${question.difficulty}">${question.difficulty}</span>
                        ${question.question}
                    </div>
                    <div class="options">
                        ${question.options.map((option, optionIndex) => `
                            <label class="option" for="q${questionNumber}o${optionIndex}">
                                <input type="radio" 
                                       name="question${questionNumber}" 
                                       value="${optionIndex}"
                                       id="q${questionNumber}o${optionIndex}">
                                <span>${option}</span>
                            </label>
                        `).join('')}
                    </div>
                ` : `
                    <div class="question-text">
                        <span class="difficulty-badge ${question.difficulty}">${question.difficulty}</span>
                        <span class="question-type-badge">Free Response</span>
                        ${question.question}
                    </div>
                    <div class="free-response">
                        <textarea 
                            class="response-input" 
                            rows="4" 
                            placeholder="Type your answer here..."
                            id="q${questionNumber}response"
                        ></textarea>
                    </div>
                `}
            </div>
        </div>
    `;
}

// Update the generateQuiz function
async function generateQuiz(text, numQuestions, isVariation = false, settings = null) {
    try {
        // Use provided settings or current form settings
        const currentSettings = settings || {
            difficulty: difficultyLevel.value,
            questionType: questionType.value
        };

        // Store the original text for generating variations later
        if (!isVariation) {
            currentQuiz.originalText = text;
        }

        const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: `As an expert educator, create ${numQuestions} sophisticated ${currentSettings.questionType} questions from this text. 
                        ${isVariation ? 'Important: Generate completely different questions than before, but on the same topics and concepts.' : ''}
                        Difficulty level: ${currentSettings.difficulty}

                        Requirements:
                        ${currentSettings.questionType === 'multiple-choice' ? `
                        1. Questions should test deep understanding, critical thinking, and application of concepts
                        2. Include analysis, evaluation, and synthesis-level questions (Bloom's higher levels)
                        3. For multiple-choice questions:
                           - Create plausible distractors that test common misconceptions
                           - Ensure options are mutually exclusive and similar in length
                           - Include "all of the above" or "none of the above" sparingly
                           - Each question MUST have exactly 4 options
                        
                        Return a JSON array where each question object has this exact format:
                        {
                            "question": "detailed question text",
                            "type": "multiple-choice",
                            "difficulty": "${currentSettings.difficulty}",
                            "options": ["option1", "option2", "option3", "option4"],
                            "correctAnswer": 0,
                            "explanation": "detailed explanation of the answer"
                        }` : currentSettings.questionType === 'free-response' ? `
                        1. Questions should require detailed explanations or analysis
                        2. Include a mix of conceptual and analytical questions
                        3. Each question should have a sample answer for reference
                        
                        Return a JSON array where each question object has this exact format:
                        {
                            "question": "detailed question text",
                            "type": "free-response",
                            "difficulty": "${currentSettings.difficulty}",
                            "sampleAnswer": "detailed sample answer",
                            "explanation": "grading criteria and key points to look for"
                        }` : `
                        1. Mix of multiple-choice and free-response questions
                        2. Balance between factual recall and critical thinking
                        3. Include appropriate format for each question type
                        
                        Return a JSON array of question objects with appropriate formats as shown above.`}
                        
                        Text to generate questions from:
                        ${text}`
                    }]
                }]
            })
        });

        const data = await response.json();
        
        // Clean and parse the response
        const responseText = data.candidates[0].content.parts[0].text;
        const cleanedResponse = responseText
            .trim()
            .replace(/```json\s*|\s*```/g, '') // Remove code blocks if present
            .replace(/[\n\r]+/g, ' ') // Remove newlines
            .replace(/\s+/g, ' '); // Normalize spaces

        let questions;
        try {
            questions = JSON.parse(cleanedResponse);
            
            // Validate the questions format
            if (!Array.isArray(questions)) {
                throw new Error('Response is not an array');
            }

            questions.forEach((q, i) => {
                if (!q.question || !q.type || !q.difficulty) {
                    throw new Error(`Invalid question format at index ${i}`);
                }
            });

            // Display the questions
            displayQuestions(questions);
            return questions;

        } catch (parseError) {
            console.error('Failed to parse response:', cleanedResponse);
            throw new Error('Invalid question format from AI');
        }

    } catch (error) {
        console.error('Error in generateQuiz:', error);
        showNotification('Failed to generate quiz: ' + error.message, 'error');
        throw new Error('Failed to generate quiz: ' + error.message);
    }
}

// Display a single question
function displayQuestion(question) {
    const questionDiv = document.createElement('div');
    questionDiv.className = `question ${question.difficulty}`;
    
    if (question.type === 'multiple-choice') {
        questionDiv.innerHTML = `
            <div class="question-text">
                <span class="question-number">${question.id}</span>
                <div>
                    <span class="difficulty-badge ${question.difficulty}">${question.difficulty}</span>
                    ${question.question}
                </div>
            </div>
            <div class="options">
                ${question.options.map((option, index) => `
                    <label class="option" for="q${question.id}o${index}">
                        <input type="radio" 
                               name="question${question.id}" 
                               value="${index}"
                               id="q${question.id}o${index}">
                        <span>${option}</span>
                    </label>
                `).join('')}
            </div>
        `;
    } else {
        questionDiv.innerHTML = `
            <div class="question-text">
                <span class="question-number">${question.id}</span>
                <div>
                    <span class="difficulty-badge ${question.difficulty}">${question.difficulty}</span>
                    <span class="question-type-badge">Free Response</span>
                    ${question.question}
                </div>
            </div>
            <div class="free-response">
                <textarea 
                    class="response-input" 
                    rows="4" 
                    placeholder="Type your answer here..."
                    id="q${question.id}response"
                ></textarea>
            </div>
        `;
    }
    
    quizQuestions.appendChild(questionDiv);
}

// Update the quiz submission handler
submitQuizBtn.addEventListener('click', async () => {
    // Save the current answer before submitting
    if (viewMode.value === 'single') {
        saveCurrentAnswer();
    } else {
        // Save all answers from the all-questions view
        currentQuiz.questions.forEach((question, index) => {
            const questionNumber = index + 1;
            if (question.type === 'multiple-choice') {
                const selectedOption = document.querySelector(`input[name="question${questionNumber}"]:checked`);
                if (selectedOption) {
                    currentQuiz.answers[questionNumber] = selectedOption.value;
                }
            } else {
                const textarea = document.querySelector(`#q${questionNumber}response`);
                if (textarea) {
                    currentQuiz.answers[questionNumber] = textarea.value;
                }
            }
        });
    }

    try {
        loadingScreen.classList.remove('hidden');
        const results = await gradeQuiz();
        displayResults(results);
        quizSection.classList.add('hidden');
        resultsSection.classList.remove('hidden');
    } catch (error) {
        console.error('Grading error:', error);
        showNotification('Error grading quiz: ' + error.message, 'error');
    } finally {
        loadingScreen.classList.add('hidden');
    }
});

// Update the grading prompt for better feedback
async function gradeQuiz() {
    const results = [];
    
    for (let i = 0; i < currentQuiz.questions.length; i++) {
        const question = currentQuiz.questions[i];
        const questionNumber = i + 1;
        
        if (question.type === 'multiple-choice') {
            const selectedAnswer = currentQuiz.answers[questionNumber];
            const isCorrect = selectedAnswer !== undefined ? 
                parseInt(selectedAnswer) === question.correctAnswer : 
                false;
            
            results.push({
                question: question.question,
                type: 'multiple-choice',
                isCorrect,
                correctAnswer: question.options[question.correctAnswer],
                userAnswer: selectedAnswer !== undefined ? 
                    question.options[parseInt(selectedAnswer)] : 
                    'No answer selected',
                explanation: question.explanation
            });
        } else {
            const userResponse = currentQuiz.answers[questionNumber] || '';
            
            if (!userResponse.trim()) {
                results.push({
                    question: question.question,
                    type: 'free-response',
                    score: 0,
                    feedback: 'No answer provided',
                    userAnswer: 'No answer provided',
                    sampleAnswer: question.sampleAnswer,
                    explanation: 'Please provide an answer to receive feedback.'
                });
                continue;
            }

            try {
                // Enhanced grading prompt for better feedback
                const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        contents: [{
                            parts: [{
                                text: `You are grading a free response answer. Return only a valid JSON object with exactly this format:
                                {
                                    "score": <number 0-5>,
                                    "feedback": "<your feedback here>",
                                    "explanation": "<your explanation here>"
                                }

                                Question: ${question.question}
                                Student Answer: ${userResponse}
                                Sample Answer: ${question.sampleAnswer}
                                Key Points: ${question.keyPoints.join(', ')}

                                Score criteria:
                                5: Excellent - Complete and accurate
                                4: Good - Mostly complete with minor gaps
                                3: Fair - Partial understanding shown
                                2: Limited - Significant gaps
                                1: Poor - Major misunderstandings
                                0: No relevant content

                                Evaluate based on:
                                - Accuracy
                                - Completeness
                                - Understanding
                                - Use of details
                                - Clarity

                                Return only the JSON object, nothing else.`
                            }]
                        }],
                        generationConfig: {
                            temperature: 0.3, // Lower temperature for more consistent output
                            maxOutputTokens: 1000,
                        }
                    })
                });

                const grading = await response.json();
                const responseText = grading.candidates[0].content.parts[0].text;
                
                // Clean the response text
                const cleanedResponse = responseText
                    .trim()
                    .replace(/```json\s*|\s*```/g, '') // Remove code blocks
                    .replace(/[\n\r]/g, ' ') // Remove newlines
                    .replace(/\s+/g, ' '); // Normalize spaces

                let gradingResult;
                try {
                    gradingResult = JSON.parse(cleanedResponse);
                } catch (parseError) {
                    console.error('Failed to parse grading response:', cleanedResponse);
                    throw new Error('Invalid grading format');
                }

                // Validate the required fields
                if (typeof gradingResult.score !== 'number' || 
                    !gradingResult.feedback || 
                    !gradingResult.explanation) {
                    throw new Error('Missing required grading fields');
                }

                results.push({
                    question: question.question,
                    type: 'free-response',
                    score: gradingResult.score,
                    feedback: gradingResult.feedback,
                    explanation: gradingResult.explanation,
                    userAnswer: userResponse,
                    sampleAnswer: question.sampleAnswer
                });
            } catch (error) {
                console.error('Grading error:', error);
                results.push({
                    question: question.question,
                    type: 'free-response',
                    score: 0,
                    feedback: 'Error during grading. Please try again.',
                    explanation: 'System was unable to grade this response.',
                    userAnswer: userResponse,
                    sampleAnswer: question.sampleAnswer
                });
            }
        }
    }
    
    return results;
}

// Update the results display to support dark theme
function displayResults(results) {
    const totalQuestions = results.length;
    const correctAnswers = results.filter(r => r.isCorrect).length;
    const scorePercentage = Math.round((correctAnswers / totalQuestions) * 100);

    // Update score display
    document.querySelector('.score-number').textContent = `${scorePercentage}%`;
    document.querySelector('.score-details').textContent = 
        `${correctAnswers} out of ${totalQuestions} correct`;

    // Generate results HTML
    const resultsHTML = results.map((result, index) => `
        <div class="question-result ${result.isCorrect ? 'correct' : 'incorrect'}">
            <div class="question-header">
                <h3>Question ${index + 1}</h3>
                <span class="result-indicator">
                    ${result.isCorrect ? '✓ Correct' : '✗ Incorrect'}
                </span>
            </div>
            <div class="question-content">
                <p class="question-text">${result.question}</p>
                <div class="answer-section">
                    ${result.type === 'multiple-choice' ? `
                        <p class="your-answer ${result.isCorrect ? 'correct-text' : 'incorrect-text'}">
                            Your answer: ${result.userAnswer}
                        </p>
                        ${!result.isCorrect ? `
                            <p class="correct-answer">
                                Correct answer: ${result.correctAnswer}
                            </p>
                        ` : ''}
                    ` : `
                        <div class="free-response">
                            <p class="answer-label">Your Response:</p>
                            <p class="user-response">${result.userAnswer}</p>
                            <p class="answer-label">Sample Answer:</p>
                            <p class="sample-answer">${result.sampleAnswer}</p>
                        </div>
                    `}
                </div>
                <div class="explanation">
                    <p class="explanation-label">Explanation:</p>
                    <p>${result.explanation}</p>
                </div>
            </div>
        </div>
    `).join('');

    document.getElementById('resultsContainer').innerHTML = resultsHTML;
}

// Handle "Generate New Quiz" button
newQuizBtn.addEventListener('click', () => {
    if (timerInterval) {
        clearInterval(timerInterval);
        const timerDisplay = document.querySelector('.timer-display');
        if (timerDisplay) {
            timerDisplay.remove();
        }
    }
    currentQuiz = {
        questions: [],
        answers: {},
        originalText: '',
        flaggedQuestions: new Set(),
        settings: {}
    };
    quizQuestions.innerHTML = '';
    resultsContainer.innerHTML = '';
    textInput.value = '';
    fileInput.value = '';
    resultsSection.classList.add('hidden');
    quizForm.classList.remove('hidden');
});

// Update the theme toggle function
function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
}

// Update theme toggle event listener
themeToggle.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
});

// Add timer toggle functionality
timerToggle.addEventListener('change', () => {
    timerSettings.classList.toggle('hidden', !timerToggle.checked);
});

// Function to format time
function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

// Function to create timer display
function createTimerDisplay() {
    const timerDisplay = document.createElement('div');
    timerDisplay.className = 'timer-display';
    document.body.appendChild(timerDisplay);
    return timerDisplay;
}

// Function to start timer
function startTimer(duration) {
    const timerDisplay = createTimerDisplay();
    timeLeft = duration * 60; // Convert minutes to seconds
    const fiveMinutes = 5 * 60; // 5 minutes in seconds
    const oneMinute = 60; // 1 minute in seconds
    
    function updateTimer() {
        timerDisplay.textContent = formatTime(timeLeft);
        
        // Add warning classes based on time remaining
        if (timeLeft <= fiveMinutes) {
            timerDisplay.classList.remove('normal');
            timerDisplay.classList.add('warning');
            
            if (timeLeft === fiveMinutes) {
                // Flash 5-minute warning
                showTimerAlert('5 minutes remaining!');
            }
            
            if (timeLeft <= oneMinute) {
                timerDisplay.classList.remove('warning');
                timerDisplay.classList.add('urgent');
                
                if (timeLeft === oneMinute) {
                    // Flash 1-minute warning
                    showTimerAlert('1 minute remaining!');
                }
            }
        }
        
        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            showTimerAlert('Time\'s up!');
            submitQuizBtn.click(); // Auto-submit when time is up
            timerDisplay.remove();
        }
        timeLeft--;
    }
    
    updateTimer(); // Initial display
    timerInterval = setInterval(updateTimer, 1000);
}

// Add function to show timer alerts
function showTimerAlert(message) {
    const alert = document.createElement('div');
    alert.className = 'timer-alert';
    alert.textContent = message;
    document.body.appendChild(alert);
    
    // Remove alert after animation
    setTimeout(() => {
        alert.classList.add('fade-out');
        setTimeout(() => alert.remove(), 500);
    }, 2000);
}

// Create a custom popup notification system
function showNotification(message, type = 'warning') {
    // Remove any existing notifications
    const existingNotification = document.querySelector('.notification');
    if (existingNotification) {
        existingNotification.remove();
    }

    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <div class="notification-content">
            <span class="notification-message">${message}</span>
            <button class="notification-close">×</button>
        </div>
    `;

    document.body.appendChild(notification);

    // Add the styles if they don't exist
    if (!document.querySelector('#notification-styles')) {
        const style = document.createElement('style');
        style.id = 'notification-styles';
        style.textContent = `
            .notification {
                position: fixed;
                top: 20px;
                left: 50%;
                transform: translateX(-50%);
                z-index: 10000;
                padding: 16px 24px;
                border-radius: 8px;
                background: var(--background-alt);
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                animation: slideDown 0.3s ease-out;
                border: 1px solid var(--border-color);
            }

            .notification-content {
                display: flex;
                align-items: center;
                gap: 12px;
                color: var(--text-primary);
            }

            .notification.warning {
                border-left: 4px solid #ff9800;
            }

            .notification.error {
                border-left: 4px solid var(--incorrect-color);
            }

            .notification.success {
                border-left: 4px solid var(--correct-color);
            }

            .notification-message {
                font-size: 14px;
                font-weight: 500;
            }

            .notification-close {
                background: none;
                border: none;
                color: var(--text-secondary);
                font-size: 20px;
                cursor: pointer;
                padding: 0;
                margin-left: 12px;
            }

            .notification-close:hover {
                color: var(--text-primary);
            }

            @keyframes slideDown {
                from {
                    transform: translate(-50%, -100%);
                    opacity: 0;
                }
                to {
                    transform: translate(-50%, 0);
                    opacity: 1;
                }
            }

            @media (prefers-color-scheme: dark) {
                .notification {
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
                }
            }
        `;
        document.head.appendChild(style);
    }

    // Add close button functionality
    const closeButton = notification.querySelector('.notification-close');
    closeButton.addEventListener('click', () => {
        notification.remove();
    });

    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (notification.parentElement) {
            notification.remove();
        }
    }, 5000);
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    // Set initial theme
    setTheme(savedTheme);
    
    // Set initial tab
    const activeTab = document.querySelector('.tab-btn.active');
    if (activeTab) {
        const tabContent = document.getElementById(activeTab.dataset.tab + 'Tab');
        if (tabContent) {
            tabContent.classList.add('active');
        }
    }
    
    // Clear any existing form data
    quizForm.reset();
    if (essayInput) {
        essayInput.value = '';
    }
    
    initializeKeyboardShortcuts();
    improveAccessibility();
    initializeModalKeyboardNav();
    
    // Add keyboard shortcut hints
    const shortcuts = {
        'Previous Question': '←',
        'Next Question': '→',
        'Flag Question': 'F',
        'Submit Quiz': 'Ctrl + S',
        'Close Modal': 'Esc'
    };
    
    // Add shortcut hints to buttons
    Object.entries(shortcuts).forEach(([action, key]) => {
        const hint = document.createElement('span');
        hint.className = 'shortcut-hint';
        hint.textContent = key;
        // Add to relevant buttons based on action
    });

    // Set initial view mode on load
    document.documentElement.setAttribute('data-view-mode', viewMode.value);
});

// Update viewMode change handler to set data attribute
viewMode.addEventListener('change', () => {
    document.documentElement.setAttribute('data-view-mode', viewMode.value);
    if (currentQuiz.questions.length > 0) {
        // Clear flagged questions when switching to all questions view
        if (viewMode.value === 'all') {
            currentQuiz.flaggedQuestions.clear();
        }
        displayQuestions(currentQuiz.questions);
    }
});

// Add modal functionality
aboutBtn.addEventListener('click', () => {
    aboutModal.classList.remove('hidden');
    setTimeout(() => aboutModal.classList.add('show'), 10);
});

closeBtn.addEventListener('click', closeModal);

aboutModal.addEventListener('click', (e) => {
    if (e.target === aboutModal) {
        closeModal();
    }
});

function closeModal() {
    aboutModal.classList.remove('show');
    setTimeout(() => aboutModal.classList.add('hidden'), 300);
}

// Add escape key handler
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !aboutModal.classList.contains('hidden')) {
        closeModal();
    }
});

// Add these functions for number input controls
window.incrementQuestions = function() {
    const input = document.getElementById('questionCount');
    const currentValue = parseInt(input.value) || 0;
    if (currentValue < 30) {
        input.value = currentValue + 1;
    }
};

window.decrementQuestions = function() {
    const input = document.getElementById('questionCount');
    const currentValue = parseInt(input.value) || 0;
    if (currentValue > 1) {
        input.value = currentValue - 1;
    }
};

// Add input validation
document.getElementById('questionCount').addEventListener('input', function(e) {
    let value = parseInt(e.target.value);
    if (value > 30) e.target.value = 30;
    if (value < 1) e.target.value = 1;
});

// Add function to store quiz settings
function storeQuizSettings() {
    currentQuiz.settings = {
        difficulty: document.getElementById('difficultyLevel').value,
        questionType: document.getElementById('questionType').value,
        questionCount: document.getElementById('questionCount').value,
        viewMode: document.getElementById('viewMode').value,
        timerEnabled: document.getElementById('timerToggle').checked,
        timerMinutes: document.getElementById('timerMinutes').value
    };
}

// Update the similar quiz generation logic
const similarQuizModal = document.getElementById('similarQuizModal');
const similarQuizForm = document.getElementById('similarQuizForm');
const keepCurrentSettingsBtn = document.getElementById('keepCurrentSettings');
const closeSimilarQuizModalBtn = document.getElementById('closeSimilarQuizModal');

// Update the generate similar quiz button click handler
document.getElementById('generateSimilar').addEventListener('click', () => {
    // Populate form with current settings
    document.getElementById('similarDifficulty').value = currentQuiz.settings.difficulty;
    document.getElementById('similarQuestionType').value = currentQuiz.settings.questionType;
    document.getElementById('similarQuestionCount').value = currentQuiz.settings.questionCount;
    document.getElementById('similarViewMode').value = currentQuiz.settings.viewMode;
    
    // Show modal
    similarQuizModal.classList.remove('hidden');
    setTimeout(() => similarQuizModal.classList.add('show'), 10);
});

// Handle keeping current settings
keepCurrentSettingsBtn.addEventListener('click', async () => {
    // Show loading screen immediately
    document.getElementById('loadingScreen').classList.remove('hidden');
    
    // Hide modal first
    similarQuizModal.classList.remove('show');
    setTimeout(() => similarQuizModal.classList.add('hidden'), 300);
    
    try {
        await generateSimilarQuiz(currentQuiz.settings);
    } catch (error) {
        console.error('Error generating similar quiz:', error);
        alert('Failed to generate similar quiz. Please try again.');
    } finally {
        // Hide loading screen
        document.getElementById('loadingScreen').classList.add('hidden');
    }
});

// Handle form submission with new settings
similarQuizForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // Show loading screen immediately
    document.getElementById('loadingScreen').classList.remove('hidden');
    
    // Hide modal first
    similarQuizModal.classList.remove('show');
    setTimeout(() => similarQuizModal.classList.add('hidden'), 300);
    
    try {
        const newSettings = {
            difficulty: document.getElementById('similarDifficulty').value,
            questionType: document.getElementById('similarQuestionType').value,
            questionCount: document.getElementById('similarQuestionCount').value,
            viewMode: document.getElementById('similarViewMode').value,
            timerEnabled: currentQuiz.settings.timerEnabled,
            timerMinutes: currentQuiz.settings.timerMinutes
        };

        // Update quiz state with new settings
        currentQuiz.settings = newSettings;
        
        // Generate new questions
        const questions = await generateQuiz(
            currentQuiz.originalText,
            newSettings.questionCount,
            true, // isVariation parameter
            newSettings // Pass the new settings to generateQuiz
        );
        
        // Update quiz state
        currentQuiz.questions = questions;
        currentQuiz.answers = {};
        currentQuiz.flaggedQuestions = new Set();
        
        // Hide results and show new quiz
        document.getElementById('resultsSection').classList.add('hidden');
        document.getElementById('quizSection').classList.remove('hidden');
        
        // Display questions based on view mode
        if (newSettings.viewMode === 'single') {
            currentQuestionIndex = 0;
            displaySingleQuestion();
        } else {
            displayAllQuestions();
        }
    } catch (error) {
        console.error('Error generating similar quiz:', error);
        alert('Failed to generate similar quiz. Please try again.');
    } finally {
        // Hide loading screen
        document.getElementById('loadingScreen').classList.add('hidden');
    }
});

// Close modal handler
closeSimilarQuizModalBtn.addEventListener('click', () => {
    similarQuizModal.classList.remove('show');
    setTimeout(() => similarQuizModal.classList.add('hidden'), 300);
});

// Update the generateSimilarQuiz function to use settings
async function generateSimilarQuiz(settings) {
    document.getElementById('loadingScreen').classList.remove('hidden');
    
    try {
        // Use provided settings or current settings
        const questions = await generateQuiz(
            currentQuiz.originalText, 
            settings.questionCount, 
            true, // isVariation parameter
            settings // Pass the new settings to generateQuiz
        );
        
        // Update quiz state with new settings
        currentQuiz.settings = settings;
        currentQuiz.questions = questions;
        currentQuiz.answers = {};
        currentQuiz.flaggedQuestions = new Set();
        
        // Hide results and show new quiz
        document.getElementById('resultsSection').classList.add('hidden');
        document.getElementById('quizSection').classList.remove('hidden');
        
        // Display questions based on view mode
        if (settings.viewMode === 'single') {
            currentQuestionIndex = 0;
            displaySingleQuestion();
        } else {
            displayAllQuestions();
        }
    } catch (error) {
        console.error('Error generating similar quiz:', error);
        alert('Failed to generate similar quiz. Please try again.');
    } finally {
        document.getElementById('loadingScreen').classList.add('hidden');
    }
}

// Add these functions for similar quiz number input controls
window.incrementSimilarQuestions = function() {
    const input = document.getElementById('similarQuestionCount');
    const currentValue = parseInt(input.value) || 0;
    if (currentValue < 30) {
        input.value = currentValue + 1;
    }
};

window.decrementSimilarQuestions = function() {
    const input = document.getElementById('similarQuestionCount');
    const currentValue = parseInt(input.value) || 0;
    if (currentValue > 1) {
        input.value = currentValue - 1;
    }
};

// Add input validation for similar quiz number input
document.getElementById('similarQuestionCount').addEventListener('input', function(e) {
    let value = parseInt(e.target.value);
    if (value > 30) e.target.value = 30;
    if (value < 1) e.target.value = 1;
});

// Add keyboard shortcuts and accessibility improvements
function initializeKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Only handle shortcuts if not typing in an input
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            return;
        }

        // Shortcuts for single question view
        if (viewMode.value === 'single' && !quizSection.classList.contains('hidden')) {
            switch(e.key) {
                case 'ArrowLeft':
                    // Previous question
                    if (currentQuestionIndex > 0) {
                        saveCurrentAnswer();
                        currentQuestionIndex--;
                        displaySingleQuestion();
                    }
                    break;
                case 'ArrowRight':
                    // Next question
                    if (currentQuestionIndex < currentQuiz.questions.length - 1) {
                        saveCurrentAnswer();
                        currentQuestionIndex++;
                        displaySingleQuestion();
                    }
                    break;
                case 'f':
                case 'F':
                    // Flag/unflag current question
                    const questionNumber = currentQuestionIndex + 1;
                    toggleFlag(questionNumber);
                    break;
            }
        }

        // Global shortcuts
        switch(e.key) {
            case 'Escape':
                // Close any open modal
                const openModals = document.querySelectorAll('.modal:not(.hidden)');
                openModals.forEach(modal => {
                    modal.classList.remove('show');
                    setTimeout(() => modal.classList.add('hidden'), 300);
                });
                break;
            case 's':
            case 'S':
                // Submit quiz if visible
                if (!quizSection.classList.contains('hidden') && e.ctrlKey) {
                    e.preventDefault();
                    submitQuizBtn.click();
                }
                break;
        }
    });
}

// Add ARIA labels and roles for better accessibility
function improveAccessibility() {
    // Add ARIA labels to buttons
    document.querySelectorAll('button').forEach(button => {
        if (!button.getAttribute('aria-label')) {
            button.setAttribute('aria-label', button.textContent.trim());
        }
    });

    // Add roles to sections
    quizSection.setAttribute('role', 'main');
    resultsSection.setAttribute('role', 'region');
    resultsSection.setAttribute('aria-label', 'Quiz Results');

    // Add live region for notifications
    const liveRegion = document.createElement('div');
    liveRegion.setAttribute('role', 'status');
    liveRegion.setAttribute('aria-live', 'polite');
    liveRegion.className = 'sr-only';
    document.body.appendChild(liveRegion);

    // Update progress announcements for screen readers
    if (viewMode.value === 'single') {
        const progressText = document.createElement('div');
        progressText.className = 'sr-only';
        progressText.setAttribute('aria-live', 'polite');
        quizSection.appendChild(progressText);
    }
}

// Add keyboard navigation for modal
function initializeModalKeyboardNav() {
    const modals = document.querySelectorAll('.modal');
    
    modals.forEach(modal => {
        const focusableElements = modal.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const firstFocusable = focusableElements[0];
        const lastFocusable = focusableElements[focusableElements.length - 1];

        modal.addEventListener('keydown', (e) => {
            if (e.key === 'Tab') {
                if (e.shiftKey) {
                    if (document.activeElement === firstFocusable) {
                        e.preventDefault();
                        lastFocusable.focus();
                    }
                } else {
                    if (document.activeElement === lastFocusable) {
                        e.preventDefault();
                        firstFocusable.focus();
                    }
                }
            }
        });
    });
}