const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 8000;

// --- 1. Middleware (CORS & Config) ---
app.use(cors({
    origin: [
        'http://localhost:5173',
        'https://drive-fleet-client-sq3c.vercel.app',
        'https://drive-fleet-client-kuwbr0v8r-mdfizz655s-projects.vercel.app' // তোমার সব ভার্সেল লিঙ্ক এখানে থাকবে
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
}));

app.use(express.json());
app.use(cookieParser());

// --- 2. MongoDB Connection ---
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.u6o9fcg.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

// --- 3. Verify Token Middleware ---
const verifyToken = (req, res, next) => {
    const token = req?.cookies?.token;
    if (!token) {
        return res.status(401).send({ message: 'Unauthorized: No token provided' });
    }
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).send({ message: 'Unauthorized: Invalid token' });
        }
        req.user = decoded;
        next();
    });
};

async function run() {
    try {
        const db = client.db("driveFleetDB");
        const carCollection = db.collection("cars");
        const bookingCollection = db.collection("bookings");

        // --- 4. Auth & JWT (Production Optimized) ---
        app.post('/jwt', async (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '5h' });

            res.cookie('token', token, {
                httpOnly: true,
                secure: true,      // লাইভ সাইটে এটি অবশ্যই true হবে
                sameSite: 'none',  // আলাদা ডোমেইনের জন্য এটি none হবে
            }).send({ success: true });
        });

        app.post('/logout', (req, res) => {
            res.clearCookie('token', {
                httpOnly: true,
                secure: true,
                sameSite: 'none',
            }).send({ success: true });
        });

        // --- 5. CARS APIs (CRUD) ---

        // সব গাড়ি আনা (Search & Filter সহ)
        app.get('/cars', async (req, res) => {
            const { search, filter } = req.query;
            let query = {};
            if (search) query.name = { $regex: search, $options: 'i' };
            if (filter && filter !== 'All') query.type = filter;
            const result = await carCollection.find(query).toArray();
            res.send(result);
        });

        // সিঙ্গেল গাড়ি আনা
        app.get('/car/:id', async (req, res) => {
            const id = req.params.id;
            const result = await carCollection.findOne({ _id: new ObjectId(id) });
            res.send(result);
        });

        // নতুন গাড়ি অ্যাড করা (Private)
        app.post('/cars', verifyToken, async (req, res) => {
            const carData = req.body;
            const result = await carCollection.insertOne(carData);
            res.send(result);
        });

        // নিজের গাড়ি দেখা (Private)
        app.get('/my-cars/:email', verifyToken, async (req, res) => {
            const email = req.params.email;
            if (req.user.email !== email) return res.status(403).send({ message: 'Forbidden' });
            const result = await carCollection.find({ ownerEmail: email }).toArray();
            res.send(result);
        });

        // গাড়ি আপডেট (Private)
        app.put('/car/:id', verifyToken, async (req, res) => {
            const id = req.params.id;
            const updateDoc = { $set: req.body };
            const result = await carCollection.updateOne({ _id: new ObjectId(id) }, updateDoc);
            res.send(result);
        });

        // গাড়ি ডিলিট (Private)
        app.delete('/car/:id', verifyToken, async (req, res) => {
            const id = req.params.id;
            const result = await carCollection.deleteOne({ _id: new ObjectId(id) });
            res.send(result);
        });

        // --- 6. Booking APIs ---
        app.post('/bookings', verifyToken, async (req, res) => {
            const bookingData = req.body;
            const result = await bookingCollection.insertOne(bookingData);
            // $inc ব্যবহার করে booking_count বাড়ানো
            await carCollection.updateOne(
                { _id: new ObjectId(bookingData.carId) },
                { $inc: { booking_count: 1 } }
            );
            res.send(result);
        });

        app.get('/my-bookings/:email', verifyToken, async (req, res) => {
            const result = await bookingCollection.find({ userEmail: req.params.email }).toArray();
            res.send(result);
        });

        console.log("Successfully connected to MongoDB!");
    } finally {}
}
run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('DriveFleet Production Server is Running...');
});

app.listen(port, () => {
    console.log(`Server is running on port: ${port}`);
});