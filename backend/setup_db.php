<?php

$dbPath = __DIR__ . '/database.db';

// Remove existing database
if (file_exists($dbPath)) {
    unlink($dbPath);
}

$db = new SQLite3($dbPath);
$db->enableExceptions(true);
$db->exec('PRAGMA journal_mode=WAL');
$db->exec('PRAGMA foreign_keys=ON');

// Create tables
$db->exec('
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    is_admin INTEGER DEFAULT 0,
    totp_secret TEXT DEFAULT NULL,
    totp_enabled INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

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
    bottle_size TEXT DEFAULT \'750ml\',
    producer TEXT,
    food_pairing TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

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

CREATE TABLE orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    total REAL NOT NULL,
    status TEXT DEFAULT \'pending\',
    shipping_name TEXT NOT NULL,
    shipping_street TEXT NOT NULL,
    shipping_city TEXT NOT NULL,
    shipping_postal_code TEXT NOT NULL,
    shipping_phone TEXT NOT NULL,
    delivery_notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

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

CREATE TABLE reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wine_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
    comment TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (wine_id) REFERENCES wines(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE(wine_id, user_id)
);
');

// Seed wine data
$wines = [
    [
        "Quinta do Vallado Douro Tinto", "Douro", "Red", 2020, 185.00,
        "/images/wines/vallado.jpg",
        "A rich and elegant Douro red wine with deep ruby color. Notes of ripe dark fruits, spice, and a touch of oak. Well-structured tannins with a long, smooth finish. Perfect for pairing with hearty Portuguese dishes.",
        "Rich and elegant Douro red wine",
        "Touriga Nacional, Touriga Franca, Tinta Roriz", 13.5, "750ml",
        "Quinta do Vallado", "Red meats, aged cheeses, stews"
    ],
    [
        "Pêra-Manca Branco", "Alentejo", "White", 2019, 890.00,
        "/images/wines/pera-manca-branco.jpg",
        "An iconic Portuguese white wine from the Alentejo region. Complex aromas of tropical fruits, white flowers, and honey. Rich, full-bodied palate with exceptional balance and a remarkably long finish. One of Portugal's most prestigious white wines.",
        "Iconic premium Alentejo white wine",
        "Antão Vaz, Arinto", 13.0, "750ml",
        "Fundação Eugénio de Almeida", "Seafood risotto, lobster, creamy pasta"
    ],
    [
        "Quinta da Aveleda Vinho Verde", "Vinho Verde", "White", 2023, 75.00,
        "/images/wines/aveleda.jpg",
        "A fresh and youthful Vinho Verde with a slight sparkle. Bright citrus and green apple aromas with floral hints. Light, crisp, and incredibly refreshing. The quintessential summer wine from Portugal's Minho region.",
        "Fresh and crisp Vinho Verde",
        "Loureiro, Alvarinho, Pedernã", 11.0, "750ml",
        "Quinta da Aveleda", "Grilled fish, salads, light appetizers"
    ],
    [
        "Barca Velha", "Douro", "Red", 2011, 3500.00,
        "/images/wines/barca-velha.jpg",
        "Portugal's most legendary red wine, only produced in exceptional vintages. Intensely concentrated with layers of dark fruit, chocolate, cedar, and spice. Majestic structure with velvety tannins and an extraordinarily long finish that evolves over decades.",
        "Portugal's most legendary red wine",
        "Touriga Nacional, Touriga Franca, Tinta Roriz, Tinta Barroca", 14.0, "750ml",
        "Casa Ferreirinha", "Premium beef, game meats, truffle dishes"
    ],
    [
        "Mateus Rosé", "Bairrada", "Rosé", 2023, 59.00,
        "/images/wines/mateus.jpg",
        "The world-famous Portuguese rosé in its iconic flask-shaped bottle. Delicate pink color with aromas of red berries and a hint of citrus. Light, slightly fizzy, and perfectly balanced between sweet and dry. An approachable and versatile wine.",
        "World-famous Portuguese rosé",
        "Baga, Rufete, Tinta Barroca", 11.0, "750ml",
        "Sogrape Vinhos", "Salads, grilled chicken, sushi"
    ],
    [
        "Casa Ferreirinha Reserva Especial", "Douro", "Red", 2017, 1250.00,
        "/images/wines/cf-reserva.jpg",
        "An exceptional Douro red from the makers of Barca Velha. Deep garnet color with complex aromas of blackcurrant, plum, and aromatic herbs over a base of fine oak. Full-bodied with silky tannins and remarkable depth. A wine of great elegance.",
        "Exceptional Douro red, great elegance",
        "Touriga Nacional, Touriga Franca, Tinta Roriz", 14.0, "750ml",
        "Casa Ferreirinha", "Lamb, duck, mature cheeses"
    ],
    [
        "Esporão Reserva Tinto", "Alentejo", "Red", 2020, 149.00,
        "/images/wines/esporao-reserva.jpg",
        "A benchmark Alentejo red with deep purple color. Ripe blackberry, plum, and cherry aromas intertwined with hints of vanilla and spice from oak aging. Medium to full body with smooth tannins and a generous, warm finish typical of the Alentejo sun.",
        "Benchmark Alentejo red wine",
        "Aragonez, Trincadeira, Cabernet Sauvignon, Alicante Bouschet", 14.0, "750ml",
        "Herdade do Esporão", "Grilled meats, roasted vegetables, pizza"
    ],
    [
        "Quinta do Crasto Reserva Old Vines", "Douro", "Red", 2019, 280.00,
        "/images/wines/crasto-reserva.jpg",
        "Made from old vines planted over 80 years ago in the heart of Douro. Intense aromas of ripe black fruits, violets, and graphite. Powerful yet refined palate with firm tannins and exceptional concentration. Ages beautifully for 15+ years.",
        "Powerful old vine Douro red",
        "Touriga Nacional, Touriga Franca, Tinta Roriz, Sousão", 14.5, "750ml",
        "Quinta do Crasto", "Steak, wild boar, aged Queijo da Serra"
    ],
    [
        "Luís Pato Bairrada Tinto", "Bairrada", "Red", 2019, 125.00,
        "/images/wines/luis-pato.jpg",
        "A characterful Bairrada red from one of the region's pioneering winemakers. Bright ruby with aromas of sour cherry, blackberry, and earthy notes. Medium body with lively acidity and firm tannins. Distinctly Portuguese and food-friendly.",
        "Characterful Bairrada red wine",
        "Baga", 12.5, "750ml",
        "Luís Pato", "Roasted suckling pig, duck rice, grilled sardines"
    ],
    [
        "Graham's Port 10 Year Tawny", "Douro", "Port", 2024, 220.00,
        "/images/wines/grahams-10.jpg",
        "A beautifully aged tawny port with amber-gold color. Rich aromas of dried fruits, nuts, caramel, and butterscotch. Smooth, velvety palate with perfect balance between sweetness and acidity. A warming, complex wine ideal for after dinner.",
        "Beautifully aged 10 year tawny port",
        "Touriga Nacional, Touriga Franca, Tinta Barroca, Tinta Roriz", 20.0, "750ml",
        "Graham's", "Dark chocolate desserts, blue cheese, crème brûlée"
    ],
    [
        "Alvarinho Soalheiro", "Vinho Verde", "White", 2022, 165.00,
        "/images/wines/soalheiro.jpg",
        "A premium single-varietal Alvarinho from the Melgaço sub-region. Intense aromas of peach, apricot, and passion fruit with mineral undertones. Rich and textured palate with vibrant acidity and a long, aromatic finish. One of Portugal's finest white wines.",
        "Premium Alvarinho from Melgaço",
        "Alvarinho", 13.0, "750ml",
        "Soalheiro", "Shellfish, ceviche, goat cheese"
    ],
    [
        "Mouchão Tinto", "Alentejo", "Red", 2017, 320.00,
        "/images/wines/mouchao.jpg",
        "A classic Alentejo red from one of the region's oldest estates. Deep, inky color with aromas of ripe plum, violet, and wild herbs. Full-bodied and opulent with soft, ripe tannins and a long, warm finish. Traditional winemaking at its finest.",
        "Classic Alentejo red, opulent and warm",
        "Alicante Bouschet, Trincadeira", 14.5, "750ml",
        "Herdade do Mouchão", "Slow-cooked pork, bean stews, cured meats"
    ],
    [
        "Caves São João Porta dos Cavaleiros Dão", "Dão", "Red", 2018, 99.00,
        "/images/wines/porta-cavaleiros.jpg",
        "An elegant and traditional Dão red wine. Ruby-garnet color with aromas of red fruits, forest floor, and a hint of spice. Medium body with fine-grained tannins, bright acidity, and a delicate finish. Excellent value from the granite-rich Dão region.",
        "Elegant traditional Dão red wine",
        "Touriga Nacional, Alfrocheiro, Jaen", 13.0, "750ml",
        "Caves São João", "Grilled meats, risotto, mild cheeses"
    ],
    [
        "Taylor's Late Bottled Vintage Port", "Douro", "Port", 2018, 165.00,
        "/images/wines/taylors-lbv.jpg",
        "A rich and full-bodied LBV Port with deep ruby color. Intense aromas of blackberry, cherry, and dark chocolate. Full, round palate with ripe fruit flavors, a velvety texture, and a long, satisfying finish. Ready to enjoy now.",
        "Rich full-bodied Late Bottled Vintage",
        "Touriga Nacional, Touriga Franca, Tinta Barroca", 20.0, "750ml",
        "Taylor's", "Strong cheeses, chocolate cake, dried fruits"
    ],
    [
        "Niepoort Redoma Branco", "Douro", "White", 2021, 240.00,
        "/images/wines/niepoort-redoma.jpg",
        "A complex and age-worthy Douro white wine. Pale gold with aromas of white peach, almond, and a touch of honey. Rich, creamy palate with vibrant mineral acidity and a long, layered finish. A masterclass in Douro white winemaking.",
        "Complex age-worthy Douro white",
        "Códega, Rabigato, Viosinho, Arinto", 12.5, "750ml",
        "Niepoort", "Grilled sea bass, roasted chicken, aged Azeitão cheese"
    ],
    [
        "Quinta dos Roques Encruzado", "Dão", "White", 2022, 150.00,
        "/images/wines/roques-encruzado.jpg",
        "A stunning Dão white from the noble Encruzado grape. Bright golden hue with aromas of citrus, white flowers, and mineral notes. Elegant and focused palate with creamy texture, fine acidity, and a persistent finish. The benchmark for Dão whites.",
        "Stunning Dão white, benchmark quality",
        "Encruzado", 13.0, "750ml",
        "Quinta dos Roques", "Grilled fish, white meats, creamy risotto"
    ],
    [
        "Blandy's 10 Year Malmsey Madeira", "Madeira", "Fortified", 2024, 285.00,
        "/images/wines/blandys-malmsey.jpg",
        "A lusciously sweet Madeira wine with deep amber color. Rich aromas of caramel, dried figs, dark chocolate, and orange peel. Full, velvety palate with remarkable complexity, balancing sweetness with Madeira's signature tangy acidity. Practically immortal.",
        "Luscious 10 year Malmsey Madeira",
        "Malmsey (Malvasia)", 19.0, "750ml",
        "Blandy's", "Tiramisu, pecan pie, foie gras, blue cheese"
    ],
    [
        "Quinta de Chocapalha Arinto", "Lisboa", "White", 2023, 89.00,
        "/images/wines/chocapalha-arinto.jpg",
        "A vibrant and refreshing white from the Lisboa region. Light straw color with aromas of green apple, lemon zest, and white flowers. Crisp, clean palate with zesty acidity and a citrus-driven finish. A perfect everyday wine.",
        "Vibrant refreshing Lisboa white",
        "Arinto", 12.5, "750ml",
        "Quinta de Chocapalha", "Fried fish, clams, light salads"
    ],
    [
        "Murganheira Espumante Bruto", "Bairrada", "Sparkling", 2019, 199.00,
        "/images/wines/murganheira.jpg",
        "A premium Portuguese sparkling wine made by the traditional method. Fine, persistent bubbles with aromas of brioche, green apple, and toasted almonds. Elegant and fresh on the palate with beautiful mousse and a clean, mineral finish.",
        "Premium traditional method sparkling",
        "Baga, Chardonnay", 12.5, "750ml",
        "Murganheira", "Oysters, canapés, celebration toasts"
    ],
    [
        "Quinta da Pellada Tinto", "Dão", "Red", 2018, 220.00,
        "/images/wines/pellada.jpg",
        "An artisanal Dão red from one of the region's finest estates. Bright garnet with perfumed aromas of wild strawberry, violet, and pine resin. Medium-bodied with silky tannins, fresh acidity, and a graceful, lingering finish. Pure Dão elegance.",
        "Artisanal elegant Dão red",
        "Touriga Nacional, Jaen, Alfrocheiro", 13.0, "750ml",
        "Quinta da Pellada", "Roasted lamb, mushroom dishes, semi-hard cheeses"
    ],
    [
        "Casal Garcia Vinho Verde", "Vinho Verde", "White", 2023, 55.00,
        "/images/wines/casal-garcia.jpg",
        "Portugal's best-selling Vinho Verde, fresh and easy-drinking. Light straw color with green reflections. Citrus and tropical fruit aromas with a hint of fizz. Light-bodied, crisp, and refreshing with a clean finish. The perfect patio wine.",
        "Portugal's best-selling Vinho Verde",
        "Trajadura, Loureiro, Azal", 10.5, "750ml",
        "Aveleda", "Sushi, ceviche, light appetizers, summer salads"
    ],
    [
        "Herdade do Peso Vinha do Monte", "Alentejo", "Red", 2021, 69.00,
        "/images/wines/vinha-monte.jpg",
        "A great-value everyday Alentejo red. Deep ruby color with aromas of ripe red fruits and a touch of spice. Smooth, easy-drinking palate with soft tannins and a fruity finish. Incredible quality for the price.",
        "Great-value everyday Alentejo red",
        "Aragonez, Trincadeira, Castelão", 13.5, "750ml",
        "Herdade do Peso", "Pasta, burgers, casual dining"
    ],
    [
        "Ramos Pinto Duas Quintas Reserva", "Douro", "Red", 2019, 195.00,
        "/images/wines/ramos-pinto.jpg",
        "An outstanding Douro red from two prestigious quintas. Deep color with complex aromas of blackcurrant, cedar, and spice. Structured palate with fine tannins, good depth, and a long, polished finish. Excellent aging potential.",
        "Outstanding Douro reserva red",
        "Touriga Nacional, Touriga Franca, Tinta Roriz", 14.0, "750ml",
        "Ramos Pinto", "Roasted meats, game, aged cheeses"
    ],
    [
        "Quinta do Ameal Loureiro", "Vinho Verde", "White", 2022, 135.00,
        "/images/wines/ameal-loureiro.jpg",
        "A single-varietal Loureiro of exceptional purity. Pale gold with intense floral and citrus aromas - orange blossom, lime, and white peach. Elegant and textured palate with excellent acidity and a mineral-driven finish. A benchmark Vinho Verde.",
        "Exceptional single-varietal Loureiro",
        "Loureiro", 12.0, "750ml",
        "Quinta do Ameal", "Grilled prawns, seared scallops, tempura"
    ]
];

$stmt = $db->prepare(
    "INSERT INTO wines (name, region, type, vintage, price, image_url, description, description_short, grapes, alcohol, bottle_size, producer, food_pairing) 
     VALUES (:name, :region, :type, :vintage, :price, :image_url, :desc, :desc_short, :grapes, :alcohol, :bottle_size, :producer, :food_pairing)"
);

foreach ($wines as $w) {
    $stmt->bindValue(':name', $w[0], SQLITE3_TEXT);
    $stmt->bindValue(':region', $w[1], SQLITE3_TEXT);
    $stmt->bindValue(':type', $w[2], SQLITE3_TEXT);
    $stmt->bindValue(':vintage', $w[3], SQLITE3_INTEGER);
    $stmt->bindValue(':price', $w[4], SQLITE3_FLOAT);
    $stmt->bindValue(':image_url', $w[5], SQLITE3_TEXT);
    $stmt->bindValue(':desc', $w[6], SQLITE3_TEXT);
    $stmt->bindValue(':desc_short', $w[7], SQLITE3_TEXT);
    $stmt->bindValue(':grapes', $w[8], SQLITE3_TEXT);
    $stmt->bindValue(':alcohol', $w[9], SQLITE3_FLOAT);
    $stmt->bindValue(':bottle_size', $w[10], SQLITE3_TEXT);
    $stmt->bindValue(':producer', $w[11], SQLITE3_TEXT);
    $stmt->bindValue(':food_pairing', $w[12], SQLITE3_TEXT);
    $stmt->execute();
    $stmt->reset();
}

// Create demo users
$demoHash = password_hash('password123', PASSWORD_BCRYPT);

$stmt = $db->prepare('INSERT INTO users (name, email, password_hash) VALUES (:name, :email, :hash)');
$stmt->bindValue(':name', 'Joe Silva', SQLITE3_TEXT);
$stmt->bindValue(':email', 'joe@example.com', SQLITE3_TEXT);
$stmt->bindValue(':hash', $demoHash, SQLITE3_TEXT);
$stmt->execute();
$joeId = $db->lastInsertRowID();

$stmt->reset();
$stmt->bindValue(':name', 'Jane Doe', SQLITE3_TEXT);
$stmt->bindValue(':email', 'jane@example.com', SQLITE3_TEXT);
$stmt->bindValue(':hash', $demoHash, SQLITE3_TEXT);
$stmt->execute();
$janeId = $db->lastInsertRowID();

// Create admin user
$stmt2 = $db->prepare('INSERT INTO users (name, email, password_hash, is_admin) VALUES (:name, :email, :hash, 1)');
$stmt2->bindValue(':name', 'Admin', SQLITE3_TEXT);
$stmt2->bindValue(':email', 'admin@example.com', SQLITE3_TEXT);
$stmt2->bindValue(':hash', $demoHash, SQLITE3_TEXT);
$stmt2->execute();
$adminId = $db->lastInsertRowID();

// Seed orders for Joe (user 1)
$db->exec("INSERT INTO orders (user_id, total, status, shipping_name, shipping_street, shipping_city, shipping_postal_code, shipping_phone, delivery_notes)
VALUES ($joeId, 465.00, 'delivered', 'Joe Silva', 'Rua das Flores 42', 'Lisboa', '1200-195', '+351 912 345 678', 'Ring the doorbell twice')");
$joeOrder1 = $db->lastInsertRowID();

$db->exec("INSERT INTO order_items (order_id, wine_id, wine_name, price, quantity, subtotal) VALUES
($joeOrder1, 1, 'Quinta do Vallado Douro Tinto', 185.00, 1, 185.00),
($joeOrder1, 8, 'Quinta do Crasto Reserva Old Vines', 280.00, 1, 280.00)");

$db->exec("INSERT INTO orders (user_id, total, status, shipping_name, shipping_street, shipping_city, shipping_postal_code, shipping_phone, delivery_notes)
VALUES ($joeId, 178.00, 'pending', 'Joe Silva', 'Rua das Flores 42', 'Lisboa', '1200-195', '+351 912 345 678', '')");
$joeOrder2 = $db->lastInsertRowID();

$db->exec("INSERT INTO order_items (order_id, wine_id, wine_name, price, quantity, subtotal) VALUES
($joeOrder2, 5, 'Mateus Rosé', 59.00, 2, 118.00),
($joeOrder2, 21, 'Casal Garcia Vinho Verde', 55.00, 1, 55.00),
($joeOrder2, 3, 'Quinta da Aveleda Vinho Verde', 75.00, 1, 75.00)");

// Seed orders for Jane (user 2)
$db->exec("INSERT INTO orders (user_id, total, status, shipping_name, shipping_street, shipping_city, shipping_postal_code, shipping_phone, delivery_notes)
VALUES ($janeId, 3500.00, 'shipped', 'Jane Doe', 'Avenida da Liberdade 110', 'Porto', '4000-322', '+351 934 567 890', 'Leave with the concierge')");
$janeOrder1 = $db->lastInsertRowID();

$db->exec("INSERT INTO order_items (order_id, wine_id, wine_name, price, quantity, subtotal) VALUES
($janeOrder1, 4, 'Barca Velha', 3500.00, 1, 3500.00)");

$db->exec("INSERT INTO orders (user_id, total, status, shipping_name, shipping_street, shipping_city, shipping_postal_code, shipping_phone, delivery_notes)
VALUES ($janeId, 625.00, 'delivered', 'Jane Doe', 'Avenida da Liberdade 110', 'Porto', '4000-322', '+351 934 567 890', '')");
$janeOrder2 = $db->lastInsertRowID();

$db->exec("INSERT INTO order_items (order_id, wine_id, wine_name, price, quantity, subtotal) VALUES
($janeOrder2, 2, 'Pêra-Manca Branco', 890.00, 1, 890.00)");

$db->exec("INSERT INTO orders (user_id, total, status, shipping_name, shipping_street, shipping_city, shipping_postal_code, shipping_phone, delivery_notes)
VALUES ($janeId, 504.00, 'pending', 'Jane Doe', 'Avenida da Liberdade 110', 'Porto', '4000-322', '+351 934 567 890', 'Call before delivery')");
$janeOrder3 = $db->lastInsertRowID();

$db->exec("INSERT INTO order_items (order_id, wine_id, wine_name, price, quantity, subtotal) VALUES
($janeOrder3, 10, 'Graham''s Port 10 Year Tawny', 220.00, 1, 220.00),
($janeOrder3, 17, 'Blandy''s 10 Year Malmsey Madeira', 285.00, 1, 285.00)");

// Seed reviews for Joe and Jane across several wines
$reviews = [
    // Joe's reviews
    [$joeId, 1, 5, 'Absolutely magnificent! The Touriga Nacional shines through with dark fruit and spice. One of the best Douro reds I have ever tasted.'],
    [$joeId, 3, 4, 'Very refreshing and perfect for summer. Great value Vinho Verde with nice citrus notes.'],
    [$joeId, 4, 5, 'Worth every penny. A once-in-a-lifetime wine experience. Layers upon layers of complexity.'],
    [$joeId, 7, 4, 'Solid Alentejo red. Great with grilled meats. Would buy again.'],
    [$joeId, 10, 5, 'Perfect tawny port. The caramel and dried fruit notes are incredible. Amazing after dinner.'],
    [$joeId, 15, 4, 'Beautiful Douro white. Complex and age-worthy. The mineral finish is outstanding.'],
    [$joeId, 21, 3, 'Good everyday wine but nothing special. Nice and refreshing though.'],
    // Jane's reviews
    [$janeId, 1, 4, 'Very elegant wine. Love the structure and the long finish.'],
    [$janeId, 2, 5, 'One of the best Portuguese whites. The complexity and balance are exceptional.'],
    [$janeId, 4, 5, 'Legendary for a reason. Deep, complex, and unforgettable. A masterpiece.'],
    [$janeId, 5, 3, 'Nice and easy-drinking but a bit too simple for my taste.'],
    [$janeId, 8, 5, 'Incredible concentration from those old vines. Power and elegance combined.'],
    [$janeId, 10, 4, 'Beautiful tawny port with lovely nutty notes. Great for dessert pairing.'],
    [$janeId, 11, 5, 'The best Alvarinho I have tried. Intense aromatics and wonderful mineral finish.'],
    [$janeId, 17, 5, 'Superb Madeira. The complexity is mind-blowing. Sweet but perfectly balanced with acidity.'],
    [$janeId, 19, 4, 'Elegant and perfumed. Love the Burgundy-like character of this Dão red.'],
];

$reviewStmt = $db->prepare('INSERT INTO reviews (wine_id, user_id, rating, comment) VALUES (:wine_id, :user_id, :rating, :comment)');
foreach ($reviews as $r) {
    $reviewStmt->bindValue(':user_id', $r[0], SQLITE3_INTEGER);
    $reviewStmt->bindValue(':wine_id', $r[1], SQLITE3_INTEGER);
    $reviewStmt->bindValue(':rating', $r[2], SQLITE3_INTEGER);
    $reviewStmt->bindValue(':comment', $r[3], SQLITE3_TEXT);
    $reviewStmt->execute();
    $reviewStmt->reset();
}

// Create exports directory with a sample CSV for the path traversal vuln
$exportsDir = __DIR__ . '/exports';
if (!is_dir($exportsDir)) {
    mkdir($exportsDir, 0755, true);
}
file_put_contents($exportsDir . '/wines-catalog.csv', "id,name,region,type,vintage,price\n1,Quinta do Vallado Douro Tinto,Douro,Red,2020,185.00\n2,Pêra-Manca Branco,Alentejo,White,2019,890.00\n3,Quinta da Aveleda Vinho Verde,Vinho Verde,White,2023,75.00\n");

echo "Database setup complete!\n";
echo "- Created 6 tables\n";
echo "- Seeded " . count($wines) . " wines\n";
echo "- Created demo user: joe@example.com / password123 (id: $joeId)\n";
echo "- Created demo user: jane@example.com / password123 (id: $janeId)\n";
echo "- Created admin user: admin@example.com / password123 (id: $adminId)\n";
echo "- Created 2 orders for Joe, 3 orders for Jane\n";
echo "- Seeded " . count($reviews) . " wine reviews\n";
echo "- Created exports directory with sample CSV\n";

$db->close();
