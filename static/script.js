document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements - Password Gate
    const passwordGate = document.getElementById('password-gate');
    const gateForm = document.getElementById('gate-form');
    const gatePasswordInput = document.getElementById('gate-password');
    const toggleGatePasswordBtn = document.getElementById('toggle-gate-password');
    const gateError = document.getElementById('gate-error');
    const mainApp = document.getElementById('main-app');

    // DOM Elements - Composer
    const composeForm = document.getElementById('compose-form');
    const senderEmail = document.getElementById('dashboard-email');
    const appPassword = document.getElementById('dashboard-password');
    const togglePasswordBtn = document.getElementById('toggle-password');
    const senderName = document.getElementById('sender-name');
    const emailSubject = document.getElementById('subject');
    const messageBody = document.getElementById('message-body');

    // DOM Elements - Recipients
    const recipientsInput = document.getElementById('recipients-input');
    const detectedCount = document.getElementById('detected-count');
    const emailValidationError = document.getElementById('email-validation-error');

    // DOM Elements - Progress Monitor
    const statTotal = document.getElementById('stat-total');
    const statSent = document.getElementById('stat-sent');
    const statFailed = document.getElementById('stat-failed');
    const statRemaining = document.getElementById('stat-remaining');
    const progressBar = document.getElementById('progress-bar');
    const statusIcon = document.getElementById('status-icon');
    const statusText = document.getElementById('status-text');
    const sendBtn = document.getElementById('send-btn');
    const stopBtn = document.getElementById('stop-btn');

    // State Variables
    let parsedEmails = [];
    let socket = null;
    let isSending = false;

    // --- PASSWORD GATE LOGIC ---
    // Toggle Password Visibility (Gate)
    toggleGatePasswordBtn.addEventListener('click', () => {
        const type = gatePasswordInput.getAttribute('type') === 'password' ? 'text' : 'password';
        gatePasswordInput.setAttribute('type', type);
        toggleGatePasswordBtn.querySelector('i').className = type === 'password' ? 'fa-regular fa-eye' : 'fa-regular fa-eye-slash';
    });

    // Toggle Password Visibility (Gmail App Password)
    togglePasswordBtn.addEventListener('click', () => {
        const type = appPassword.getAttribute('type') === 'password' ? 'text' : 'password';
        appPassword.setAttribute('type', type);
        togglePasswordBtn.querySelector('i').className = type === 'password' ? 'fa-regular fa-eye' : 'fa-regular fa-eye-slash';
    });

    // Handle gate submission
    gateForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        gateError.classList.add('hidden');
        const password = gatePasswordInput.value;

        try {
            const response = await fetch('/api/verify-gate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password })
            });

            const data = await response.json();
            if (response.ok && data.success) {
                // Animate gate slide out / fade out
                passwordGate.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
                passwordGate.style.opacity = '0';
                setTimeout(() => {
                    passwordGate.classList.add('hidden');
                    mainApp.classList.remove('hidden');
                    mainApp.classList.add('fade-in');
                }, 400);
            } else {
                gateError.classList.remove('hidden');
                gatePasswordInput.focus();
            }
        } catch (err) {
            console.error(err);
            gateError.querySelector('span').textContent = 'Server connection error.';
            gateError.classList.remove('hidden');
        }
    });

    // --- RECIPIENTS PARSER LOGIC ---
    function parseAndCleanEmails(text) {
        if (!text) return [];
        // Matches standard email formats, accommodating commas, tabs, spaces, newlines
        const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
        const matches = text.match(emailRegex);
        if (!matches) return [];
        // Return unique values
        return [...new Set(matches.map(email => email.trim().toLowerCase()))];
    }

    recipientsInput.addEventListener('input', () => {
        const text = recipientsInput.value;
        parsedEmails = parseAndCleanEmails(text);
        
        detectedCount.textContent = `${parsedEmails.length} found`;
        statTotal.textContent = parsedEmails.length;
        statRemaining.textContent = parsedEmails.length;
        
        if (text && parsedEmails.length === 0) {
            emailValidationError.classList.remove('hidden');
        } else {
            emailValidationError.classList.add('hidden');
        }
    });

    // --- BULK EMAIL SENDING STATE MACHINE ---
    function setFormDisabled(disabled) {
        senderEmail.disabled = disabled;
        appPassword.disabled = disabled;
        senderName.disabled = disabled;
        emailSubject.disabled = disabled;
        messageBody.disabled = disabled;
        recipientsInput.disabled = disabled;
    }

    function resetStats() {
        statSent.textContent = '0';
        statFailed.textContent = '0';
        statRemaining.textContent = parsedEmails.length.toString();
        progressBar.style.width = '0%';
    }

    function updateStatusUI(status, message, details = '') {
        statusText.innerHTML = `<strong>${message}</strong>${details ? `<br><small class="text-muted">${details}</small>` : ''}`;
        
        // Update Icon based on status
        statusIcon.className = 'fa-solid';
        if (status === 'ready') {
            statusIcon.classList.add('fa-circle-pause', 'text-muted');
        } else if (status === 'connecting') {
            statusIcon.classList.add('fa-circle-notch', 'fa-spin', 'text-warning');
        } else if (status === 'sending') {
            statusIcon.classList.add('fa-circle-play', 'text-success');
        } else if (status === 'paused' || status === 'stopped') {
            statusIcon.classList.add('fa-circle-stop', 'text-danger');
        } else if (status === 'success') {
            statusIcon.classList.add('fa-circle-check', 'text-success');
        } else if (status === 'error') {
            statusIcon.classList.add('fa-triangle-exclamation', 'text-danger');
        }
    }

    // Start Send Process
    sendBtn.addEventListener('click', () => {
        if (isSending) return;

        // Perform validation
        if (!composeForm.checkValidity()) {
            composeForm.reportValidity();
            return;
        }

        if (parsedEmails.length === 0) {
            emailValidationError.classList.remove('hidden');
            recipientsInput.focus();
            return;
        }
        emailValidationError.classList.add('hidden');

        // Turnstile check
        let turnstileToken = '';
        try {
            turnstileToken = turnstile.getResponse();
        } catch (e) {
            console.error('Turnstile getResponse failed:', e);
        }

        if (!turnstileToken) {
            alert('Please complete the Spam Protection (Turnstile) verification first.');
            return;
        }

        isSending = true;
        setFormDisabled(true);
        resetStats();
        
        sendBtn.classList.add('hidden');
        stopBtn.classList.remove('hidden');
        
        updateStatusUI('connecting', 'Verifying Captcha and establishing connection...');

        // Connect WebSocket
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws/send`;
        
        socket = new WebSocket(wsUrl);

        socket.onopen = () => {
            // Send payload to start bulk sending
            const payload = {
                action: 'start',
                credentials: {
                    email: senderEmail.value.trim(),
                    password: appPassword.value,
                    sender_name: senderName.value.trim()
                },
                email_details: {
                    subject: emailSubject.value.trim(),
                    body: messageBody.value
                },
                recipients: parsedEmails,
                turnstile_token: turnstileToken
            };
            socket.send(JSON.stringify(payload));
        };

        socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                
                if (data.type === 'progress') {
                    // Update stats
                    statSent.textContent = data.sent;
                    statFailed.textContent = data.failed;
                    statRemaining.textContent = data.remaining;

                    // Progress bar
                    const percent = data.total > 0 ? (data.processed / data.total) * 100 : 0;
                    progressBar.style.width = `${percent}%`;

                    if (data.current_recipient) {
                        updateStatusUI('sending', `Sending to ${data.current_recipient}...`, `Progress: ${data.processed}/${data.total}`);
                    }
                } else if (data.type === 'log') {
                    console.log('Backend log:', data.message);
                } else if (data.type === 'complete') {
                    updateStatusUI('success', 'Sending completed!', `Sent: ${data.sent}, Failed: ${data.failed}`);
                    finishSending();
                } else if (data.type === 'stopped') {
                    updateStatusUI('stopped', 'Sending stopped by user.', `Successfully sent: ${data.sent}, Failed: ${data.failed}`);
                    finishSending();
                } else if (data.type === 'error') {
                    updateStatusUI('error', 'Error occurred:', data.message);
                    finishSending();
                }
            } catch (err) {
                console.error('WebSocket message parsing error:', err);
            }
        };

        socket.onerror = (err) => {
            console.error('WebSocket Error:', err);
            updateStatusUI('error', 'Connection lost or server error.');
            finishSending();
        };

        socket.onclose = () => {
            console.log('WebSocket connection closed.');
            if (isSending) {
                updateStatusUI('error', 'Connection closed unexpectedly.');
                finishSending();
            }
        };
    });

    // Stop Send Process
    stopBtn.addEventListener('click', () => {
        if (!isSending || !socket) return;
        
        updateStatusUI('connecting', 'Stopping process. Waiting for current email to finish...');
        
        // Send stop command via WebSocket
        socket.send(JSON.stringify({ action: 'stop' }));
    });

    function finishSending() {
        isSending = false;
        setFormDisabled(false);
        sendBtn.classList.remove('hidden');
        stopBtn.classList.add('hidden');
        
        // Reset turnstile so it can be completed again for next run
        try {
            turnstile.reset();
        } catch (e) {
            console.warn('Could not reset turnstile widget:', e);
        }
        
        if (socket) {
            socket.close();
            socket = null;
        }
    }
});
