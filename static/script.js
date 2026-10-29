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
    const richEditor = document.getElementById('rich-editor');
    const editorToolbar = document.getElementById('editor-toolbar');
    const fontFamilySelect = document.getElementById('font-family-select');
    const fontSizeSelect = document.getElementById('font-size-select');
    const formatBlockSelect = document.getElementById('format-block-select');
    const btnToggleSource = document.getElementById('btn-toggle-source');
    const btnSampleTemplate = document.getElementById('btn-sample-template');
    const textColorPicker = document.getElementById('text-color-picker');
    const bgColorPicker = document.getElementById('bg-color-picker');
    const textColorIndicator = document.getElementById('text-color-indicator');
    const bgColorIndicator = document.getElementById('bg-color-indicator');
    const btnInsertLink = document.getElementById('btn-insert-link');
    const editorWordCount = document.getElementById('editor-word-count');

    // DOM Elements - Recipients
    const recipientsInput = document.getElementById('recipients-input');
    const detectedCount = document.getElementById('detected-count');
    const emailValidationError = document.getElementById('email-validation-error');

    // DOM Elements - File Upload
    const fileDropZone = document.getElementById('file-drop-zone');
    const fileUploadInput = document.getElementById('file-upload-input');
    const fileInfo = document.getElementById('file-info');
    const fileNameLabel = document.getElementById('file-name-label');
    const clearFileBtn = document.getElementById('clear-file-btn');

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

    // --- FILE UPLOAD LOGIC ---
    function processFile(file) {
        if (!file) return;
        const ext = file.name.split('.').pop().toLowerCase();
        if (!['csv', 'txt'].includes(ext)) {
            alert('Only .csv and .txt files are supported.');
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            const content = e.target.result;
            const emails = parseAndCleanEmails(content);
            // Merge with existing textarea content
            const existing = parseAndCleanEmails(recipientsInput.value);
            const merged = [...new Set([...existing, ...emails])];
            recipientsInput.value = merged.join('\n');
            parsedEmails = merged;
            detectedCount.textContent = `${merged.length} found`;
            statTotal.textContent = merged.length;
            statRemaining.textContent = merged.length;
            emailValidationError.classList.add('hidden');
            // Show file info
            fileNameLabel.textContent = `${file.name}  (${emails.length} emails found)`;
            fileInfo.classList.remove('hidden');
            fileDropZone.classList.add('file-loaded');
        };
        reader.readAsText(file);
    }

    // Click to browse
    fileDropZone.addEventListener('click', (e) => {
        if (e.target === clearFileBtn || clearFileBtn.contains(e.target)) return;
        fileUploadInput.click();
    });

    fileUploadInput.addEventListener('change', () => {
        if (fileUploadInput.files.length > 0) {
            processFile(fileUploadInput.files[0]);
        }
    });

    // Drag and drop
    fileDropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        fileDropZone.classList.add('drag-over');
    });
    fileDropZone.addEventListener('dragleave', () => {
        fileDropZone.classList.remove('drag-over');
    });
    fileDropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        fileDropZone.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file) processFile(file);
    });

    // Clear file
    clearFileBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        fileUploadInput.value = '';
        fileInfo.classList.add('hidden');
        fileDropZone.classList.remove('file-loaded');
        // Clear textarea too
        recipientsInput.value = '';
        parsedEmails = [];
        detectedCount.textContent = '0 found';
        statTotal.textContent = '0';
        statRemaining.textContent = '0';
    });

    // --- BULK EMAIL SENDING STATE MACHINE ---
    function setFormDisabled(disabled) {
        senderEmail.disabled = disabled;
        appPassword.disabled = disabled;
        senderName.disabled = disabled;
        emailSubject.disabled = disabled;
        messageBody.disabled = disabled;
        recipientsInput.disabled = disabled;
        if (richEditor) {
            richEditor.contentEditable = (!disabled).toString();
        }
        if (editorToolbar) {
            editorToolbar.style.opacity = disabled ? '0.4' : '1';
            editorToolbar.style.pointerEvents = disabled ? 'none' : 'auto';
        }
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
        syncEditorContent();

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
                    body: messageBody.value,
                    is_html: true
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

    
    // --- RICH TEXT & MULTI-FONT EDITOR LOGIC ---
    let isSourceMode = false;

    function syncEditorContent() {
        if (!richEditor) return;
        const html = richEditor.innerHTML;
        const text = richEditor.innerText.trim();
        if (!text && (!html || html === '<br>' || html === '<p><br></p>')) {
            messageBody.value = '';
        } else {
            messageBody.value = isSourceMode ? messageBody.value : html;
        }
        updateWordCount(text);
    }

    function updateWordCount(text) {
        if (!editorWordCount) return;
        const chars = text ? text.length : 0;
        const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
        editorWordCount.textContent = `${words} word${words === 1 ? '' : 's'} | ${chars} character${chars === 1 ? '' : 's'}`;
    }

    function updateToolbarActiveState() {
        if (!editorToolbar || isSourceMode) return;
        const commands = ['bold', 'italic', 'underline', 'strikeThrough', 'justifyLeft', 'justifyCenter', 'justifyRight', 'justifyFull', 'insertUnorderedList', 'insertOrderedList'];
        commands.forEach(cmd => {
            const btn = editorToolbar.querySelector(`.btn-tool[data-command="${cmd}"]`);
            if (btn) {
                try {
                    if (document.queryCommandState(cmd)) {
                        btn.classList.add('active');
                    } else {
                        btn.classList.remove('active');
                    }
                } catch (e) {}
            }
        });
    }

    if (richEditor && editorToolbar) {
        editorToolbar.querySelectorAll('.btn-tool[data-command]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                if (isSourceMode) return;
                const cmd = btn.dataset.command;
                richEditor.focus();
                document.execCommand('styleWithCSS', false, true);
                document.execCommand(cmd, false, null);
                syncEditorContent();
                updateToolbarActiveState();
            });
        });

        if (fontFamilySelect) {
            fontFamilySelect.addEventListener('change', () => {
                if (isSourceMode) return;
                const font = fontFamilySelect.value;
                if (!font) return;
                richEditor.focus();
                document.execCommand('styleWithCSS', false, true);
                document.execCommand('fontName', false, font);
                syncEditorContent();
                fontFamilySelect.selectedIndex = 0;
            });
        }

        if (fontSizeSelect) {
            fontSizeSelect.addEventListener('change', () => {
                if (isSourceMode) return;
                const size = fontSizeSelect.value;
                if (!size) return;
                richEditor.focus();
                const sel = window.getSelection();
                if (sel && sel.rangeCount > 0) {
                    if (sel.isCollapsed) {
                        const span = document.createElement('span');
                        span.style.fontSize = size;
                        span.innerHTML = '&#8203;';
                        const range = sel.getRangeAt(0);
                        range.insertNode(span);
                        range.setStart(span, 1);
                        range.collapse(true);
                        sel.removeAllRanges();
                        sel.addRange(range);
                    } else {
                        document.execCommand('styleWithCSS', false, true);
                        document.execCommand('fontSize', false, '7');
                        const fontSpans = richEditor.querySelectorAll('font[size="7"], span[style*="xxx-large"], span[style*="-webkit-xxx-large"]');
                        fontSpans.forEach(el => {
                            el.removeAttribute('size');
                            el.style.fontSize = size;
                        });
                    }
                }
                syncEditorContent();
                fontSizeSelect.selectedIndex = 0;
            });
        }

        if (formatBlockSelect) {
            formatBlockSelect.addEventListener('change', () => {
                if (isSourceMode) return;
                const block = formatBlockSelect.value;
                if (!block) return;
                richEditor.focus();
                document.execCommand('formatBlock', false, `<${block}>`);
                syncEditorContent();
                formatBlockSelect.selectedIndex = 0;
            });
        }

        if (textColorPicker) {
            textColorPicker.addEventListener('input', (e) => {
                if (isSourceMode) return;
                richEditor.focus();
                document.execCommand('styleWithCSS', false, true);
                document.execCommand('foreColor', false, e.target.value);
                if (textColorIndicator) textColorIndicator.style.backgroundColor = e.target.value;
                syncEditorContent();
            });
        }

        if (bgColorPicker) {
            bgColorPicker.addEventListener('input', (e) => {
                if (isSourceMode) return;
                richEditor.focus();
                document.execCommand('styleWithCSS', false, true);
                if (!document.execCommand('hiliteColor', false, e.target.value)) {
                    document.execCommand('backColor', false, e.target.value);
                }
                if (bgColorIndicator) bgColorIndicator.style.backgroundColor = e.target.value;
                syncEditorContent();
            });
        }

        if (btnInsertLink) {
            btnInsertLink.addEventListener('click', () => {
                if (isSourceMode) return;
                richEditor.focus();
                const url = prompt('Enter link URL (e.g. https://example.com):', 'https://');
                if (url && url !== 'https://') {
                    document.execCommand('createLink', false, url);
                    syncEditorContent();
                }
            });
        }

        if (btnSampleTemplate) {
            btnSampleTemplate.addEventListener('click', () => {
                if (richEditor.innerText.trim() && !confirm('Insert formatted sample email? This will replace current text.')) {
                    return;
                }
                richEditor.innerHTML = `
<h1 style="color: #6366f1; font-family: 'Outfit', sans-serif; font-size: 26px; margin-bottom: 8px;">Exclusive Update &bull; Secure Mail Console</h1>
<p style="font-family: Arial, sans-serif; font-size: 16px; color: #374151; line-height: 1.6;">
  Hello there, this is a demonstration of our <strong>multi-font rich text capability</strong>. You can customize font families, sizes, weights, and colors!
</p>
<blockquote style="font-family: Georgia, serif; font-size: 15px; color: #4f46e5; border-left: 3px solid #6366f1; padding-left: 12px; margin: 12px 0;">
  "Typography is the craft of endowing human language with a durable visual form."
</blockquote>
<p style="font-family: 'Fira Code', monospace; font-size: 14px; background: #f3f4f6; color: #1f2937; padding: 10px; border-radius: 6px;">
  Code snippet in Monospace: verification_status = "verified"
</p>
<ul style="font-family: 'Segoe UI', Tahoma, sans-serif; font-size: 15px; color: #374151;">
  <li><strong>Outfit &amp; Inter:</strong> Modern, clean sans-serif UI typography</li>
  <li><strong>Georgia &amp; Times:</strong> Elegant and authoritative serif headlines</li>
  <li><strong>Comic Sans &amp; Brush Script:</strong> Friendly, casual &amp; playful announcements</li>
  <li><span style="background-color: #fef08a; padding: 2px 6px; border-radius: 3px;">Full color highlighting</span> and custom hyperlinks</li>
</ul>
<hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;">
<p style="font-size: 13px; color: #9ca3af; font-family: Arial, sans-serif;">
  Sent via <strong>Secure Mail Console</strong> &bull; <a href="https://localhost:8000" style="color: #6366f1;">Manage Preferences</a>
</p>
`;
                if (isSourceMode) {
                    messageBody.value = richEditor.innerHTML;
                }
                syncEditorContent();
            });
        }

        if (btnToggleSource) {
            btnToggleSource.addEventListener('click', () => {
                isSourceMode = !isSourceMode;
                if (isSourceMode) {
                    messageBody.value = richEditor.innerHTML;
                    richEditor.classList.add('hidden');
                    messageBody.classList.remove('hidden');
                    btnToggleSource.classList.add('active');
                    btnToggleSource.innerHTML = '<i class="fa-solid fa-eye"></i> <span>Visual View</span>';
                    editorToolbar.style.opacity = '0.4';
                    editorToolbar.style.pointerEvents = 'none';
                    messageBody.focus();
                } else {
                    richEditor.innerHTML = messageBody.value;
                    messageBody.classList.add('hidden');
                    richEditor.classList.remove('hidden');
                    btnToggleSource.classList.remove('active');
                    btnToggleSource.innerHTML = '<i class="fa-solid fa-code"></i> <span>HTML Code</span>';
                    editorToolbar.style.opacity = '1';
                    editorToolbar.style.pointerEvents = 'auto';
                    richEditor.focus();
                    syncEditorContent();
                }
            });
        }

        richEditor.addEventListener('input', syncEditorContent);
        richEditor.addEventListener('keyup', updateToolbarActiveState);
        richEditor.addEventListener('mouseup', updateToolbarActiveState);
        messageBody.addEventListener('input', () => {
            if (isSourceMode) {
                const text = messageBody.value.replace(/<[^>]+>/g, '').trim();
                updateWordCount(text);
            }
        });
    }

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
