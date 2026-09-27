<?php

require_once __DIR__ . '/../models/CoverageHit.php';

class CoverageRecorder {
    private static $viewId = null;

    // Handlers often exit() right after setting an error status, so the hit is
    // written at shutdown, when the final status code is known.
    public static function start() {
        register_shutdown_function([self::class, 'record']);
    }

    public static function mark($viewId) {
        self::$viewId = $viewId;
    }

    public static function record() {
        if (self::$viewId === null) {
            return;
        }

        $sessionId = CoverageHit::normalizeSessionId($_SERVER['HTTP_X_COVERAGE_SESSION'] ?? null);
        if ($sessionId === null) {
            return;
        }

        $error = error_get_last();
        $crashed = $error && in_array($error['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR], true);
        $success = !$crashed && http_response_code() < 400;

        try {
            (new CoverageHit())->record($sessionId, self::$viewId, $success);
        } catch (Throwable $e) {
            // A recording failure must never add output to the response
        }
    }
}
