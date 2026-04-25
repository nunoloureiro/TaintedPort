<?php

class ContactController {
    public function preview() {
        $name    = isset($_POST['name'])    ? $_POST['name']    : '';
        $email   = isset($_POST['email'])   ? $_POST['email']   : '';
        $subject = isset($_POST['subject']) ? $_POST['subject'] : '';
        $message = isset($_POST['message']) ? $_POST['message'] : '';

        header('Content-Type: text/html; charset=UTF-8');
        echo <<<HTML
<!DOCTYPE html>
<html>
<head>
<title>Message Sent</title>
<style>
  body { margin: 0; padding: 24px; background: #18181b; color: #d4d4d8; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
  h1 { color: #fff; font-size: 1.25rem; margin: 0 0 16px; }
  .field { margin-bottom: 12px; }
  .label { color: #a1a1aa; font-size: 0.875rem; }
  .value { color: #e4e4e7; }
  hr { border: none; border-top: 1px solid #27272a; margin: 16px 0; }
  .message { color: #e4e4e7; line-height: 1.6; }
  .badge { display: inline-block; padding: 4px 12px; background: rgba(34,197,94,0.1); border: 1px solid rgba(34,197,94,0.3); border-radius: 6px; color: #4ade80; font-size: 0.875rem; margin-bottom: 16px; }
</style>
</head>
<body>
<div class="badge">Message sent successfully</div>
<h1>Your Message</h1>
<div class="field"><span class="label">From:</span> <span class="value">$name &lt;$email&gt;</span></div>
<div class="field"><span class="label">Subject:</span> <span class="value">$subject</span></div>
<hr>
<div class="message">$message</div>
</body>
</html>
HTML;
        exit;
    }
}
