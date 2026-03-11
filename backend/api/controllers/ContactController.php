<?php

class ContactController {

    public function preview() {
        $name = isset($_POST['name']) ? $_POST['name'] : '';
        $email = isset($_POST['email']) ? $_POST['email'] : '';
        $subject = isset($_POST['subject']) ? $_POST['subject'] : '';
        $message = isset($_POST['message']) ? $_POST['message'] : '';

        header('Content-Type: text/html; charset=UTF-8');

        echo <<<HTML
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Confirm Your Message - TaintedPort</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0A0A0B; color: #FAFAFA; min-height: 100vh; }
    .container { max-width: 640px; margin: 0 auto; padding: 48px 24px; }
    h1 { font-size: 28px; font-weight: 700; margin-bottom: 8px; }
    h1 span { background: linear-gradient(135deg, #8B5CF6, #C084FC); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    .subtitle { color: #A1A1AA; font-size: 14px; margin-bottom: 32px; }
    .card { background: #18181B; border: 1px solid #27272A; border-radius: 12px; padding: 24px; margin-bottom: 24px; }
    .field { margin-bottom: 16px; }
    .field:last-child { margin-bottom: 0; }
    .label { display: block; font-size: 12px; font-weight: 500; color: #71717A; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; }
    .value { font-size: 15px; color: #E4E4E7; line-height: 1.6; }
    .message-value { white-space: pre-wrap; background: #111113; border: 1px solid #27272A; border-radius: 8px; padding: 12px 16px; font-size: 14px; color: #D4D4D8; }
    .actions { display: flex; gap: 12px; }
    .btn { display: inline-flex; align-items: center; justify-content: center; padding: 10px 20px; border-radius: 8px; font-size: 14px; font-weight: 500; text-decoration: none; cursor: pointer; border: none; transition: opacity 0.2s; }
    .btn-primary { background: linear-gradient(135deg, #8B5CF6, #C084FC); color: white; }
    .btn-primary:hover { opacity: 0.9; }
    .btn-secondary { background: #18181B; border: 1px solid #27272A; color: #D4D4D8; }
    .btn-secondary:hover { border-color: #8B5CF680; color: white; }
    .notice { margin-top: 32px; padding: 12px 16px; background: #1a1a2e; border: 1px solid #8B5CF640; border-radius: 8px; font-size: 13px; color: #A1A1AA; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Confirm Your <span>Message</span></h1>
    <p class="subtitle">Please review the details below before sending.</p>

    <div class="card">
      <div class="field">
        <span class="label">Name</span>
        <div class="value">$name</div>
      </div>
      <div class="field">
        <span class="label">Email</span>
        <div class="value">$email</div>
      </div>
      <div class="field">
        <span class="label">Subject</span>
        <div class="value">$subject</div>
      </div>
      <div class="field">
        <span class="label">Message</span>
        <div class="message-value">$message</div>
      </div>
    </div>

    <div class="actions">
      <button class="btn btn-primary" onclick="alert('Message sent! (This is a demo application)')">Confirm &amp; Send</button>
      <a href="javascript:history.back()" class="btn btn-secondary">Go Back</a>
    </div>

    <div class="notice">
      This is a preview of your contact message. Click "Confirm &amp; Send" to submit.
    </div>
  </div>
</body>
</html>
HTML;
        exit;
    }
}
