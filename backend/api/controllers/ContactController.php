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
<head><title>Contact Preview</title></head>
<body>
<h1>Message Preview</h1>
<p><strong>Name:</strong> $name</p>
<p><strong>Email:</strong> $email</p>
<p><strong>Subject:</strong> $subject</p>
<hr>
<div>$message</div>
</body>
</html>
HTML;
        exit;
    }
}
