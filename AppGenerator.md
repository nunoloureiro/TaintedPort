* Prompt for an AI developer to generate a new app:

# Build TaintedPort - A Portuguese Wine Store Single-Page Application

Name of the store: TaintedPort

**IMPORTANT:** This is an intentionally vulnerable web application designed for DAST (Dynamic Application Security Testing) and security research. It is NOT a real store. Prices, wine descriptions, and all product information are fictional or inaccurate. The application should include a prominent About page making this clear.

Create a modern, fully functional Portuguese wine e-commerce store with the following specifications:

## Technology Stack

### Frontend
- **Framework**: Next.js (latest stable version)
- **Styling**: Tailwind CSS or styled-components
- **State Management**: React Context API or Zustand
- **HTTP Client**: Axios or fetch API
- **JWT Handling**: jose or jsonwebtoken (client-side)

### Backend
- **Language**: PHP 7.4
- **Architecture**: RESTful API
- **Database**: SQLite3
- **Authentication**: JWT-based session tokens
- **CORS**: Enable CORS headers for `taintedport.com`, `localhost:3000`, `localhost:8080`

### Deployment / Hostnames
- **Frontend hostname**: `taintedport.com` (served by nginx → Next.js)
- **API hostname**: `api.taintedport.com` (served by nginx → PHP-FPM)
- Both are served from a single container with nginx virtual hosts
- For local Docker development, path-based routing (`/api`) is used as a fallback
- The frontend API base URL is a build-time variable (`API_URL`): defaults to `https://api.taintedport.com` for production, `/api` for local Docker

### Database
- **Type**: SQLite
- **Schema**: See database design section below

## UI/UX Design Theme

Base the design on the **Snyk Labs** website (https://labs.snyk.io/try-now/) with these characteristics:

### Color Palette
- Dark background (#0A0A0B or similar deep dark)
- Accent color: Purple/violet gradient (#8B5CF6 to #C084FC)
- Secondary accent: Cyan/teal for CTAs (#06B6D4)
- Text: White/off-white (#FAFAFA) for primary, gray (#A1A1AA) for secondary
- Card backgrounds: Slightly lighter dark (#18181B or #1F1F23)

### Typography
- Modern sans-serif font (Inter, Poppins, or Space Grotesk)
- Large, bold headlines
- Clean, readable body text with good contrast

### Layout & Components
- **Hero Section**: Large gradient headline, compelling CTA
- **Navigation**: Fixed top navigation bar with logo and auth buttons
- **Cards**: Elevated cards with subtle borders, hover effects with glow
- **Buttons**: 
  - Primary: Gradient or solid color with hover effects
  - Secondary: Outlined style
  - Rounded corners (rounded-lg or rounded-xl)
- **Animations**: Subtle fade-ins, smooth transitions
- **Spacing**: Generous padding and margins for breathing room

### Visual Elements
- **Logo**: SVG component (`Logo.js`) featuring a port wine glass with a small skull icon, symbolizing the "tainted" nature of the app. Text reads "TaintedPort" with gradient styling. Used in the Navbar and homepage hero.
- Gradient text effects on headlines
- Subtle grid or dot patterns in background
- Box shadows and glows on interactive elements
- Smooth hover animations (scale, glow, color shift)
- **Global footer** on every page (via `Footer.js` in root layout) stating this is a test app with a link to the About page

## Core Features & Pages

### 1. Authentication System

#### Sign Up Page (`/signup`)
- Form fields:
  - Full Name (required)
  - Email (required, validated)
  - Password (required, min 8 chars, show strength indicator)
  - Confirm Password (required)
- Terms & conditions checkbox
- "Already have an account?" link to login
- Success: Auto-login and redirect to wines page

#### Login Page (`/login`)
- Form fields:
  - Email (required)
  - Password (required)
- Two-step login flow for accounts with 2FA enabled:
  1. User submits email + password
  2. API returns `{ requires_2fa: true }` (HTTP 200) instead of a token
  3. UI transitions to a second screen asking for the 6-digit TOTP code
  4. User submits email + password + totp_code together
  5. API verifies the TOTP code and returns the JWT token
- "Remember me" checkbox (optional)
- "Forgot password?" link (can be placeholder)
- "Don't have an account?" link to signup
- Success: Store JWT, redirect to wines page

### 2. Wine Catalog (`/wines`)
- Grid layout (3-4 columns on desktop, responsive)
- Each wine card displays:
  - Wine image (use placeholder images or wine bottle illustrations)
  - Wine name
  - Region (e.g., Douro, Alentejo, Vinho Verde, etc.)
  - Type (Red, White, Rosé, Sparkling, Port)
  - Vintage year
  - Price in EUR (€)
  - "Add to Cart" button
  - "View Details" link
- Filters/Search:
  - Search by name
  - Filter by region
  - Filter by type
  - Price range slider
  - Sort by: Name, Price (asc/desc), Rating

### 3. Wine Details Page (`/wines/:id`)
- Large wine image
- Wine name and vintage
- Region badge
- Type badge
- Detailed description:
  - Grape varieties (e.g., Touriga Nacional, Alvarinho)
  - Tasting notes (aroma, palate, finish)
  - Food pairing suggestions
  - Producer/winery information
  - Alcohol percentage
  - Bottle size (750ml standard)
- Price prominently displayed
- Quantity selector (1-12)
- "Add to Cart" button
- "Back to Catalog" link
- Related wines section (3-4 similar wines)

### 4. Shopping Cart (`/cart`)
- Can be a modal/drawer or separate page
- Cart items list:
  - Wine thumbnail
  - Wine name & vintage
  - Unit price
  - Quantity selector (+/-)
  - Subtotal per item
  - Remove button
- Cart summary:
  - Subtotal
  - VAT (23% for Portugal, calculated separately)
  - Total
- "Continue Shopping" button
- "Proceed to Checkout" button
- Empty cart state: "Your cart is empty" with link back to catalog

### 5. Checkout Page (`/checkout`)
- Shipping address form:
  - Full Name
  - Street Address
  - City
  - Postal Code
  - Phone Number
- Delivery notes textarea (optional)
- Order summary sidebar:
  - List of items
  - Subtotal, VAT, Total
- Payment method: **"Payment on Delivery (Cash)"** (selected by default, no other options needed)
- "Place Order" button
- Success: Clear cart, show confirmation page with order ID

### 6. About Page (`/about`)
- Prominently displayed **warning banner** stating this is NOT a real store
- Clear disclaimers:
  - This is an intentionally vulnerable web application for security testing and educational purposes only
  - No real transactions are processed, no real products are sold, no deliveries are made
  - Wine names, prices, descriptions, and all product information are fictional or inaccurate
  - The application may contain security vulnerabilities on purpose; do not use its code in production
- Lists the purpose of the app: DAST scanning, penetration testing, security training, tool evaluation
- Shows the tech stack used
- The About link appears in the navbar (both desktop and mobile)
- The homepage footer includes a short disclaimer with a link to the About page

### 7. User Profile/Account (`/account`)
- Display user information (name, email, avatar initial)
- **Editable name:** hover over the name to reveal a pencil icon; click to inline-edit with save/cancel; press Enter to save, Escape to cancel
- **Account Settings section:**
  - **Change Email:** requires current password confirmation before updating; issues a new JWT token with the updated email; checks for duplicate emails
  - **Change Password:** requires current password confirmation; new password must be at least 8 characters; includes confirm password field
- **Two-Factor Authentication (TOTP) section:**
  - Shows current 2FA status (enabled/disabled)
  - **Enable flow:**
    1. User clicks "Enable" → backend generates a TOTP secret and `otpauth://` URI
    2. UI displays a QR code (generated client-side from the URI using the `qrcode` npm package)
    3. UI also shows the secret key in Base32 (grouped in 4-char blocks) for manual entry
    4. User scans QR code with authenticator app (Google Authenticator, Authy, etc.)
    5. User enters the 6-digit code from the app to verify
    6. Backend validates the code against the secret and enables 2FA
  - **Disable flow:** requires password confirmation
- Order history (list of past orders)
- Logout button

## API Endpoints

### Authentication Endpoints

#### `POST /api/auth/register`
**Request Body:**
```json
{
  "name": "Joe Silva",
  "email": "joe@example.com",
  "password": "password123"
}
```
**Response (201):**
```json
{
  "success": true,
  "message": "User registered successfully",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "name": "Joe Silva",
    "email": "joe@example.com"
  }
}
```

#### `POST /api/auth/login`
**Request Body:**
```json
{
  "email": "joe@example.com",
  "password": "password123",
  "totp_code": "123456"
}
```
- `totp_code` is optional. Only required when the account has 2FA enabled.

**Response (200) - Success (no 2FA, or valid TOTP code provided):**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "name": "Joe Silva",
    "email": "joe@example.com"
  }
}
```

**Response (200) - 2FA Required (account has 2FA, no `totp_code` sent):**
```json
{
  "success": false,
  "requires_2fa": true,
  "message": "Two-factor authentication code required."
}
```
Note: This returns HTTP 200 (not 401) so the client can distinguish "needs 2FA" from "wrong credentials".

**Response (401) - Invalid TOTP code:**
```json
{
  "success": false,
  "message": "Invalid two-factor authentication code."
}
```

#### `GET /api/auth/me`
**Headers:** `Authorization: Bearer <token>`
**Response (200):**
```json
{
  "success": true,
  "user": {
    "id": 1,
    "name": "Joe Silva",
    "email": "joe@example.com",
    "totp_enabled": false
  }
}
```

#### `PUT /api/auth/profile`
Update user profile (currently supports name).
**Headers:** `Authorization: Bearer <token>`
**Request Body:**
```json
{
  "name": "New Name"
}
```
**Response (200):**
```json
{
  "success": true,
  "message": "Profile updated successfully.",
  "user": {
    "id": 1,
    "name": "New Name",
    "email": "joe@example.com",
    "totp_enabled": false
  }
}
```

#### `PUT /api/auth/email`
Change user email address. Requires current password.
**Headers:** `Authorization: Bearer <token>`
**Request Body:**
```json
{
  "password": "password123",
  "new_email": "newemail@example.com"
}
```
**Response (200):**
```json
{
  "success": true,
  "message": "Email updated successfully.",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "name": "Joe Silva",
    "email": "newemail@example.com",
    "totp_enabled": false
  }
}
```
Note: Returns a new JWT token since the email (used in the token payload) has changed.

#### `PUT /api/auth/password`
Change user password. Requires current password.
**Headers:** `Authorization: Bearer <token>`
**Request Body:**
```json
{
  "current_password": "password123",
  "new_password": "newpassword456"
}
```
**Response (200):**
```json
{
  "success": true,
  "message": "Password changed successfully."
}
```

### Two-Factor Authentication (2FA) Endpoints

#### `POST /api/auth/2fa/setup`
Generates a new TOTP secret and `otpauth://` URI for QR code display.
**Headers:** `Authorization: Bearer <token>`
**Response (200):**
```json
{
  "success": true,
  "secret": "JBSWY3DPEHPK3PXPABCDEFGHIJKLMNOP",
  "otpauth_uri": "otpauth://totp/TaintedPort:joe@example.com?secret=JBSWY3DPEHPK3PXPABCDEFGHIJKLMNOP&issuer=TaintedPort&digits=6&period=30&algorithm=SHA1"
}
```

#### `POST /api/auth/2fa/enable`
Enables 2FA after verifying a TOTP code against the setup secret.
**Headers:** `Authorization: Bearer <token>`
**Request Body:**
```json
{
  "totp_secret": "JBSWY3DPEHPK3PXPABCDEFGHIJKLMNOP",
  "totp_code": "123456"
}
```
**Response (200):**
```json
{
  "success": true,
  "message": "Two-factor authentication enabled successfully."
}
```

#### `POST /api/auth/2fa/disable`
Disables 2FA. Requires password confirmation.
**Headers:** `Authorization: Bearer <token>`
**Request Body:**
```json
{
  "password": "password123"
}
```
**Response (200):**
```json
{
  "success": true,
  "message": "Two-factor authentication disabled."
}
```

### Wine Endpoints

#### `GET /api/wines`
**Query Parameters:**
- `search` (optional): Search term
- `region` (optional): Filter by region
- `type` (optional): Filter by type
- `minPrice`, `maxPrice` (optional): Price range
- `sort` (optional): `name_asc`, `name_desc`, `price_asc`, `price_desc`

**Response (200):**
```json
{
  "success": true,
  "wines": [
    {
      "id": 1,
      "name": "Quinta do Vallado Douro Tinto",
      "region": "Douro",
      "type": "Red",
      "vintage": 2020,
      "price": 185.00,
      "image_url": "/images/wines/vallado.jpg",
      "description_short": "Rich and elegant Douro red wine"
    }
  ],
  "total": 24
}
```

#### `GET /api/wines/:id`
**Response (200):**
```json
{
  "success": true,
  "wine": {
    "id": 1,
    "name": "Quinta do Vallado Douro Tinto",
    "region": "Douro",
    "type": "Red",
    "vintage": 2020,
    "price": 185.00,
    "image_url": "/images/wines/vallado.jpg",
    "description": "Full description with tasting notes...",
    "grapes": "Touriga Nacional, Touriga Franca, Tinta Roriz",
    "alcohol": 13.5,
    "bottle_size": "750ml",
    "producer": "Quinta do Vallado",
    "food_pairing": "Red meats, aged cheeses"
  }
}
```

### Cart & Order Endpoints

#### `POST /api/cart/add`
**Headers:** `Authorization: Bearer <token>`
**Request Body:**
```json
{
  "wine_id": 1,
  "quantity": 2
}
```
**Response (200):**
```json
{
  "success": true,
  "message": "Item added to cart"
}
```

#### `GET /api/cart`
**Headers:** `Authorization: Bearer <token>`
**Response (200):**
```json
{
  "success": true,
  "items": [
    {
      "id": 1,
      "wine_id": 1,
      "wine_name": "Quinta do Vallado Douro Tinto",
      "wine_image": "/images/wines/vallado.jpg",
      "price": 185.00,
      "quantity": 2,
      "subtotal": 370.00
    }
  ],
  "total": 370.00
}
```

#### `PUT /api/cart/update`
**Headers:** `Authorization: Bearer <token>`
**Request Body:**
```json
{
  "wine_id": 1,
  "quantity": 3
}
```

#### `DELETE /api/cart/remove/:wine_id`
**Headers:** `Authorization: Bearer <token>`

#### `POST /api/orders`
**Headers:** `Authorization: Bearer <token>`
**Request Body:**
```json
{
  "shipping_address": {
    "name": "Joe Silva",
    "street": "Rua das Flores, 123",
    "city": "Lisboa",
    "postal_code": "1200-123",
    "phone": "+351 912 345 678"
  },
  "delivery_notes": "Please ring the doorbell"
}
```
**Response (201):**
```json
{
  "success": true,
  "order_id": 42,
  "message": "Order placed successfully"
}
```

#### `GET /api/orders`
**Headers:** `Authorization: Bearer <token>`
**Response (200):**
```json
{
  "success": true,
  "orders": [
    {
      "id": 42,
      "order_date": "2026-02-12T10:30:00Z",
      "total": 455.00,
      "status": "pending",
      "items_count": 3
    }
  ]
}
```

## Database Schema

### Table: `users`
```sql
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    totp_secret TEXT DEFAULT NULL,
    totp_enabled INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Table: `wines`
```sql
CREATE TABLE wines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    region TEXT NOT NULL,
    type TEXT NOT NULL,
    vintage INTEGER NOT NULL,
    price REAL NOT NULL,
    image_url TEXT,
    description TEXT,
    description_short TEXT,
    grapes TEXT,
    alcohol REAL,
    bottle_size TEXT DEFAULT '750ml',
    producer TEXT,
    food_pairing TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Table: `cart_items`
```sql
CREATE TABLE cart_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    wine_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (wine_id) REFERENCES wines(id),
    UNIQUE(user_id, wine_id)
);
```

### Table: `orders`
```sql
CREATE TABLE orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    total REAL NOT NULL,
    status TEXT DEFAULT 'pending',
    shipping_name TEXT NOT NULL,
    shipping_street TEXT NOT NULL,
    shipping_city TEXT NOT NULL,
    shipping_postal_code TEXT NOT NULL,
    shipping_phone TEXT NOT NULL,
    delivery_notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);
```

### Table: `order_items`
```sql
CREATE TABLE order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    wine_id INTEGER NOT NULL,
    wine_name TEXT NOT NULL,
    price REAL NOT NULL,
    quantity INTEGER NOT NULL,
    subtotal REAL NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id),
    FOREIGN KEY (wine_id) REFERENCES wines(id)
);
```

## Sample Wine Data

**NOTE:** All prices are intentionally inflated (~10x real market value) to make it obvious this is not a real store. Nobody should mistake these for genuine offers.

Seed the database with at least 20 Portuguese wines from various regions:

**Regions to include:**
- Douro
- Alentejo
- Vinho Verde
- Dão
- Bairrada
- Lisboa
- Tejo
- Madeira
- Porto (Port wines)

**Wine types:**
- Red (Tinto)
- White (Branco)
- Rosé (Rosado)
- Sparkling (Espumante)
- Fortified (Port, Madeira)

**Example wines:**
1. Quinta do Vallado Douro Tinto (Red, Douro)
2. Pêra-Manca Branco (White, Alentejo)
3. Quinta da Aveleda Vinho Verde (White, Vinho Verde)
4. Barca Velha (Red, Douro) - premium
5. Mateus Rosé (Rosé, Bairrada)
6. Casa Ferreirinha Reserva Especial (Red, Douro)
7. Esporão Reserva (Red, Alentejo)
8. Quinta do Crasto (Red, Douro)
9. Luis Pato Bairrada (Red, Bairrada)
10. Graham's Port 10 Year Tawny (Port, Douro)

## Technical Requirements

### Frontend (Next.js)

#### Project Structure
```
/app
  /layout.js          # Root layout with navigation
  /page.js            # Home/landing page
  /signup/page.js
  /login/page.js
  /wines/page.js
  /wines/[id]/page.js
  /cart/page.js
  /checkout/page.js
  /about/page.js
  /account/page.js
/components
  /Navbar.js
  /Footer.js
  /Logo.js            # SVG logo component (port glass with skull)
  /WineCard.js
  /WineBottle.js      # SVG wine bottle illustrations
  /CartItem.js
  /Button.js
  /Input.js
/lib
  /api.js             # API client functions
  /auth.js            # JWT token management
/context
  /AuthContext.js     # User authentication state
  /CartContext.js     # Shopping cart state
/public
  /images/wines/      # Wine images
```

#### Key Features
- Client-side routing with Next.js App Router
- Protected routes (redirect to login if not authenticated)
- JWT stored in localStorage or httpOnly cookies
- Global state for cart and auth
- Responsive design (mobile, tablet, desktop)
- Loading states and error handling
- Form validation

### Backend (PHP 7)

#### Project Structure
```
/api
  /config
    /database.php     # SQLite connection
    /jwt.php          # JWT utilities
    /totp.php         # TOTP (RFC 6238) implementation
  /models
    /User.php
    /Wine.php
    /Cart.php
    /Order.php
  /controllers
    /AuthController.php
    /WineController.php
    /CartController.php
    /OrderController.php
  /middleware
    /auth.php         # JWT verification middleware
  /routes.php         # API route definitions
  /index.php          # Entry point
  /.htaccess          # Rewrite rules
```

#### Key Features
- RESTful API design
- JWT authentication with HS256 algorithm
- Password hashing with `password_hash()` and `password_verify()`
- Input validation and sanitization
- CORS headers for cross-origin requests
- Error handling with proper HTTP status codes
- Prepared statements for SQL queries (security)

#### JWT Implementation
- Secret key stored in config (use strong random string)
- Token expiration: 7 days
- Include user ID and email in payload
- Verify signature on protected routes

#### TOTP 2FA Implementation
- Implement TOTP per RFC 6238 (HMAC-SHA1, 6 digits, 30-second period)
- Base32 encoding/decoding for secrets
- Allow ±1 time window for clock skew tolerance
- Generate random 32-character Base32 secrets
- Build `otpauth://` URIs for QR code scanning
- Client-side QR code generation using the `qrcode` npm package

#### Security Best Practices
- Never store passwords in plain text
- Use prepared statements to prevent SQL injection
- Validate and sanitize all input
- Implement rate limiting on auth endpoints (optional but recommended)
- Use HTTPS in production

## Development Setup Instructions

### Frontend Setup
```bash
npx create-next-app@latest taintedport-frontend
cd taintedport-frontend
npm install axios # or your preferred HTTP client
npm run dev # Starts on http://localhost:3000
```

### Backend Setup
```bash
mkdir taintedport-backend
cd taintedport-backend
composer init # Optional, for dependencies
composer require firebase/php-jwt # For JWT handling
php -S localhost:8000 -t api # Built-in PHP server
```

### Database Setup
```bash
sqlite3 database.db
# Then run CREATE TABLE commands from schema section
# Then insert sample wine data
```

## Deliverables

1. **Frontend (Next.js)**
   - All pages and components
   - Responsive design matching Snyk Labs theme
   - Authentication flow
   - Cart and checkout functionality

2. **Backend (PHP 7 API)**
   - All API endpoints
   - JWT authentication
   - Database models and queries
   - Error handling

3. **Database**
   - SQLite database file with schema
   - Seed data (20+ Portuguese wines)

4. **Documentation**
   - README.md with setup instructions
   - API documentation
   - Environment variables needed

5. **Testing**
   - Test all user flows (signup → login → browse → add to cart → checkout)
   - Test API endpoints with Postman or similar
   - Verify authentication on protected routes

## Bonus Features (Optional)

- Wine ratings and reviews
- Wishlist functionality
- Email confirmation on order placement
- Admin panel for managing wines
- Stock inventory tracking
- Discount codes/promotions
- Wine recommendations based on preferences
- Dark/light mode toggle

## Intentional Vulnerabilities

This application is intentionally vulnerable for DAST/security testing purposes. The following vulnerabilities are built in:

### SQL Injection (SQLi)
1. **Login email field**: The login endpoint uses `findByEmailUnsafe()` which directly concatenates the email into the SQL query without parameterized statements. Exploitable via the email field on `POST /auth/login`.
2. **Wine detail page (wine ID)**: The wine detail endpoint (`GET /wines/:id`) uses `getByIdUnsafe()` which concatenates the ID directly into SQL. The route accepts non-numeric IDs.

### Cross-Site Scripting (XSS)
3. **Reflected XSS on login email**: The login error message includes the raw email address without HTML encoding: `"Login failed for <email>. Please check your credentials."` The frontend should render this unsafely.
4. **Reflected XSS on wine search**: The wine search API returns a `message` field containing the raw search query. The frontend renders it via `dangerouslySetInnerHTML`.
5. **Stored XSS on user name (account page)**: The user's name is stored without sanitization and displayed in the Navbar via `dangerouslySetInnerHTML` (e.g., `Hi, <name>`). Change name on the account page to inject.
6. **Stored XSS on shipping name (checkout/order detail)**: The shipping name entered at checkout is stored and displayed on the order detail page (`/orders/:id`) via `dangerouslySetInnerHTML`.

### JWT Vulnerabilities
7. **JWT "none" algorithm accepted**: The JWT decoder accepts tokens with `alg: "none"` and skips signature verification entirely, allowing token forgery.
8. **JWT signature not verified**: Even for HS256 tokens, the signature validation only logs a warning on mismatch but accepts the token anyway.

### Server Misconfiguration
9. **Directory listing**: Nginx serves `/files/` with `autoindex on`, exposing the backend source code and database file at both `taintedport.com/files/` and `api.taintedport.com/files/`.

### Cross-Site Request Forgery (CSRF)
10. **CSRF on checkout**: The checkout endpoint (`POST /orders`) has no CSRF token. CORS is configured to reflect any `Origin` header with `Access-Control-Allow-Credentials: true`, allowing cross-origin requests with cookies/tokens.

### Business Logic Vulnerabilities
11. **BOLA (IDOR) on order details**: The `GET /orders/:id` endpoint does not verify that the authenticated user owns the order. Any authenticated user can view any order by enumerating IDs.
12. **BOLA / Mass Assignment on profile update**: The `PUT /auth/profile` endpoint accepts an optional `user_id` field. If present, it updates that user's name instead of the authenticated user's.
13. **Price manipulation on cart**: The `POST /cart/add` endpoint accepts an optional `price` field that overrides the wine's price in the database.
14. **Broken access control on 2FA disable**: The `POST /auth/2fa/disable` endpoint accepts an optional `user_id` field. If present, it disables 2FA for that user instead of the authenticated user.
15. **Discount code bypass**: The `POST /orders` endpoint accepts `discount_code` and `discount_percent` fields. Any non-empty code is accepted and the percent is applied without validation (100 = free, >100 = negative total).

### Implementation Notes
- The **login page frontend** should render the server error message as-is (it already does via React state, and the backend includes unsanitized user input in the error). The email input should be `type="text"` (not `type="email"`) to allow HTML injection from the browser.
- For **reflected XSS on login**, a DAST scanner testing the login form should detect the email being reflected in the error response body.
- The **JWT secret** is hardcoded in `backend/api/config/jwt.php` and also exposed via directory listing.
- All vulnerabilities are documented in `KnownVulnerabilities.txt` and `KnownVulnerabilitiesPoC.txt` at the project root.

## Design Inspiration

Study these aspects of https://labs.snyk.io/try-now/:
- The hero gradient text effect
- Card hover animations with purple/cyan glow
- Dark background with subtle patterns
- Typography hierarchy and spacing
- Button styles and hover effects
- Overall modern, premium feel

**Make it look professional, modern, and visually appealing** - this is an e-commerce store, so the UI/UX should build trust and encourage purchases.

---

**Good luck building TaintedPort! 🍷**

