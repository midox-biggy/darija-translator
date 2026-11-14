<?php
declare(strict_types=1);

// Server and credentials. Override with environment variables, e.g.
//   DARIJA_URL=http://localhost:8080 DARIJA_USER=student DARIJA_PASSWORD=darija2026 php -S localhost:8000
return [
    'url' => getenv('DARIJA_URL') ?: 'http://localhost:8080',
    'user' => getenv('DARIJA_USER') ?: 'student',
    'password' => getenv('DARIJA_PASSWORD') ?: 'darija2026',
];
