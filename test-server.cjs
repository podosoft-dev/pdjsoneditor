const express = require('express');
const cors = require('cors');
const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Sample test data
const sampleData = {
	users: [
		{
			id: 1,
			name: "John Doe",
			email: "john@example.com",
			age: 30,
			active: true,
			profile: {
				bio: "Software Developer",
				location: "San Francisco",
				interests: ["coding", "reading", "hiking"]
			}
		},
		{
			id: 2,
			name: "Jane Smith",
			email: "jane@example.com",
			age: 28,
			active: false,
			profile: {
				bio: "Product Designer",
				location: "New York",
				interests: ["design", "photography", "travel"]
			}
		}
	],
	metadata: {
		version: "1.0.0",
		timestamp: new Date().toISOString(),
		totalUsers: 2
	}
};

// Products data for e-commerce test
const productsData = {
	products: [
		{
			id: 101,
			name: "Laptop Pro",
			price: 1299.99,
			stock: 15,
			categories: ["Electronics", "Computers"],
			specifications: {
				cpu: "Intel Core i7",
				ram: "16GB",
				storage: "512GB SSD",
				display: "15.6 inch"
			}
		},
		{
			id: 102,
			name: "Wireless Mouse",
			price: 29.99,
			stock: 50,
			categories: ["Electronics", "Accessories"],
			specifications: {
				connectivity: "Bluetooth 5.0",
				battery: "AA x 2",
				dpi: "1600"
			}
		}
	]
};

// Complex nested structure for testing
const complexData = {
	company: {
		name: "Tech Corp",
		founded: 2010,
		employees: 150,
		departments: [
			{
				name: "Engineering",
				headCount: 80,
				teams: [
					{
						name: "Frontend",
						members: 25,
						technologies: ["React", "Vue", "Svelte"]
					},
					{
						name: "Backend",
						members: 30,
						technologies: ["Node.js", "Python", "Go"]
					}
				]
			},
			{
				name: "Marketing",
				headCount: 30,
				campaigns: [
					{
						name: "Summer Sale",
						budget: 50000,
						channels: ["Social Media", "Email", "PPC"]
					}
				]
			}
		],
		financials: {
			revenue: 15000000,
			expenses: 12000000,
			profit: 3000000,
			quarters: [
				{ q: "Q1", revenue: 3500000 },
				{ q: "Q2", revenue: 3800000 },
				{ q: "Q3", revenue: 3700000 },
				{ q: "Q4", revenue: 4000000 }
			]
		}
	}
};

// Array of objects for testing
const arrayData = [
	{ id: 1, type: "info", message: "System initialized", timestamp: Date.now() },
	{ id: 2, type: "warning", message: "High memory usage", timestamp: Date.now() - 1000 },
	{ id: 3, type: "error", message: "Connection timeout", timestamp: Date.now() - 2000 },
	{ id: 4, type: "info", message: "Backup completed", timestamp: Date.now() - 3000 }
];

// Store for POST/PUT/PATCH testing
let dynamicData = { ...sampleData };

// Routes

// GET endpoints
app.get('/api/users', (req, res) => {
	console.log('[GET /api/users] Request received');
	res.json(dynamicData);
});

app.get('/api/products', (req, res) => {
	console.log('[GET /api/products] Request received');
	res.json(productsData);
});

app.get('/api/complex', (req, res) => {
	console.log('[GET /api/complex] Request received');
	res.json(complexData);
});

app.get('/api/array', (req, res) => {
	console.log('[GET /api/array] Request received');
	res.json(arrayData);
});

// GET with query parameters
app.get('/api/search', (req, res) => {
	console.log('[GET /api/search] Query params:', req.query);
	const { q, limit = 10 } = req.query;
	res.json({
		query: q || 'no query',
		limit: parseInt(limit),
		results: [
			{ id: 1, title: `Result for "${q}"`, score: 0.95 },
			{ id: 2, title: `Another result for "${q}"`, score: 0.87 }
		],
		timestamp: new Date().toISOString()
	});
});

// GET with path parameter
app.get('/api/users/:id', (req, res) => {
	const userId = parseInt(req.params.id);
	console.log(`[GET /api/users/${userId}] Request received`);
	const user = dynamicData.users.find(u => u.id === userId);
	if (user) {
		res.json(user);
	} else {
		res.status(404).json({ error: "User not found", userId });
	}
});

// POST endpoint
app.post('/api/users', (req, res) => {
	console.log('[POST /api/users] Body:', req.body);
	const newUser = {
		id: dynamicData.users.length + 1,
		...req.body,
		createdAt: new Date().toISOString()
	};
	dynamicData.users.push(newUser);
	res.status(201).json({
		message: "User created successfully",
		user: newUser,
		totalUsers: dynamicData.users.length
	});
});

// POST with echo (returns what was sent)
app.post('/api/echo', (req, res) => {
	console.log('[POST /api/echo] Body:', req.body);
	res.json({
		echo: req.body,
		headers: req.headers,
		timestamp: new Date().toISOString()
	});
});

// PUT endpoint
app.put('/api/users/:id', (req, res) => {
	const userId = parseInt(req.params.id);
	console.log(`[PUT /api/users/${userId}] Body:`, req.body);
	const userIndex = dynamicData.users.findIndex(u => u.id === userId);
	
	if (userIndex !== -1) {
		dynamicData.users[userIndex] = {
			...dynamicData.users[userIndex],
			...req.body,
			id: userId,
			updatedAt: new Date().toISOString()
		};
		res.json({
			message: "User updated successfully",
			user: dynamicData.users[userIndex]
		});
	} else {
		res.status(404).json({ error: "User not found", userId });
	}
});

// PATCH endpoint
app.patch('/api/users/:id', (req, res) => {
	const userId = parseInt(req.params.id);
	console.log(`[PATCH /api/users/${userId}] Body:`, req.body);
	const userIndex = dynamicData.users.findIndex(u => u.id === userId);
	
	if (userIndex !== -1) {
		// PATCH only updates provided fields
		Object.keys(req.body).forEach(key => {
			dynamicData.users[userIndex][key] = req.body[key];
		});
		dynamicData.users[userIndex].patchedAt = new Date().toISOString();
		
		res.json({
			message: "User patched successfully",
			user: dynamicData.users[userIndex],
			patchedFields: Object.keys(req.body)
		});
	} else {
		res.status(404).json({ error: "User not found", userId });
	}
});

// DELETE endpoint
app.delete('/api/users/:id', (req, res) => {
	const userId = parseInt(req.params.id);
	console.log(`[DELETE /api/users/${userId}] Request received`);
	const userIndex = dynamicData.users.findIndex(u => u.id === userId);
	
	if (userIndex !== -1) {
		const deletedUser = dynamicData.users.splice(userIndex, 1)[0];
		res.json({
			message: "User deleted successfully",
			deletedUser,
			remainingUsers: dynamicData.users.length
		});
	} else {
		res.status(404).json({ error: "User not found", userId });
	}
});

// Test endpoint for headers
app.all('/api/headers', (req, res) => {
	console.log(`[${req.method} /api/headers] Headers:`, req.headers);
	res.json({
		method: req.method,
		headers: req.headers,
		body: req.body,
		query: req.query,
		timestamp: new Date().toISOString()
	});
});

// Error simulation endpoints
app.get('/api/error/400', (req, res) => {
	res.status(400).json({ error: "Bad Request", message: "Invalid parameters" });
});

app.get('/api/error/500', (req, res) => {
	res.status(500).json({ error: "Internal Server Error", message: "Something went wrong" });
});

// Slow response simulation
app.get('/api/slow', (req, res) => {
	const delay = parseInt(req.query.delay) || 3000;
	console.log(`[GET /api/slow] Delaying response by ${delay}ms`);
	setTimeout(() => {
		res.json({
			message: `Response delayed by ${delay}ms`,
			timestamp: new Date().toISOString()
		});
	}, delay);
});

// Large data endpoint
app.get('/api/large', (req, res) => {
	const size = parseInt(req.query.size) || 100;
	console.log(`[GET /api/large] Generating ${size} items`);
	const largeArray = Array.from({ length: size }, (_, i) => ({
		id: i + 1,
		name: `Item ${i + 1}`,
		value: Math.random() * 1000,
		timestamp: Date.now() - i * 1000,
		nested: {
			level1: {
				level2: {
					level3: `Deep value ${i}`
				}
			}
		}
	}));
	res.json({
		count: size,
		data: largeArray
	});
});

// Reset data endpoint
app.post('/api/reset', (req, res) => {
	console.log('[POST /api/reset] Resetting dynamic data');
	dynamicData = { ...sampleData };
	res.json({
		message: "Data reset successfully",
		timestamp: new Date().toISOString()
	});
});

// Root endpoint
app.get('/', (req, res) => {
	res.json({
		message: "PDJSONEditor Test Server",
		version: "1.0.0",
		endpoints: [
			"GET /api/users - Get all users",
			"GET /api/users/:id - Get specific user",
			"POST /api/users - Create new user",
			"PUT /api/users/:id - Update user",
			"PATCH /api/users/:id - Patch user",
			"DELETE /api/users/:id - Delete user",
			"GET /api/products - Get products data",
			"GET /api/complex - Get complex nested data",
			"GET /api/array - Get array data",
			"GET /api/search?q=query&limit=10 - Search with query params",
			"POST /api/echo - Echo back the request",
			"ALL /api/headers - Test headers",
			"GET /api/error/400 - Simulate 400 error",
			"GET /api/error/500 - Simulate 500 error",
			"GET /api/slow?delay=3000 - Slow response",
			"GET /api/large?size=100 - Large dataset",
			"POST /api/reset - Reset dynamic data"
		]
	});
});

// Start server
app.listen(PORT, () => {
	console.log(`\n🚀 Test server is running at http://localhost:${PORT}`);
	console.log(`📝 View available endpoints at http://localhost:${PORT}/`);
	console.log('\n📌 Example URLs to test in PDJSONEditor:');
	console.log(`   - GET: http://localhost:${PORT}/api/users`);
	console.log(`   - GET: http://localhost:${PORT}/api/products`);
	console.log(`   - GET: http://localhost:${PORT}/api/complex`);
	console.log(`   - POST: http://localhost:${PORT}/api/echo`);
	console.log(`   - GET: http://localhost:${PORT}/api/search?q=test&limit=5`);
	console.log('\nPress Ctrl+C to stop the server\n');
});