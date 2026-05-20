const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 8000;

// --- 1. Middleware ---
app.use(cors({
    origin: [
        'http://localhost:5173',
        'https://drive-fleet-client-sq3c.vercel.app',
        'https://drive-fleet-client-kuwbr0v8r-mdfizz655s-projects.vercel.app'
    ],
    credentials: true
}));
app.use(express.json());

// --- 2. MongoDB Connection ---
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.u6o9fcg.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
const client = new MongoClient(uri, {
    serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true }
});

// --- 3. Verify Token Middleware (Header Based) ---
const verifyToken = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send({ message: 'Unauthorized access' });
    }
    const token = authHeader.split(' ')[1]; // Bearer <token>
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).send({ message: 'Unauthorized access' });
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

        // Auth API - সরাসরি টোকেন পাঠিয়ে দিবে
        app.post('/jwt', async (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '10h' });
            res.send({ token });
        });

        // --- Cars APIs ---
        app.get('/cars', async (req, res) => {
            const { search, filter } = req.query;
            let query = {};
            if (search) query.name = { $regex: search, $options: 'i' };
            if (filter && filter !== 'All') query.type = filter;
            const result = await carCollection.find(query).toArray();
            res.send(result);
        });

        app.get('/car/:id', async (req, res) => {
            res.send(await carCollection.findOne({ _id: new ObjectId(req.params.id) }));
        });

        app.post('/cars', verifyToken, async (req, res) => {
            res.send(await carCollection.insertOne(req.body));
        });

        app.get('/my-cars/:email', verifyToken, async (req, res) => {
            res.send(await carCollection.find({ ownerEmail: req.params.email }).toArray());
        });

        app.put('/car/:id', verifyToken, async (req, res) => {
            res.send(await carCollection.updateOne({ _id: new ObjectId(req.params.id) }, { $set: req.body }));
        });

        app.delete('/car/:id', verifyToken, async (req, res) => {
            res.send(await carCollection.deleteOne({ _id: new ObjectId(req.params.id) }));
        });

        // --- Booking APIs ---
        app.post('/bookings', verifyToken, async (req, res) => {
            const bookingData = req.body;
            const result = await bookingCollection.insertOne(bookingData);
            await carCollection.updateOne(
                { _id: new ObjectId(bookingData.carId) },
                { $inc: { booking_count: 1 } }
            );
            res.send(result);
        });

        app.get('/my-bookings/:email', verifyToken, async (req, res) => {
            res.send(await bookingCollection.find({ userEmail: req.params.email }).toArray());
        });

        console.log("Successfully connected to MongoDB!");
    } finally {}
}
run().catch(console.dir);
app.get('/', (req, res) => res.send('DriveFleet API Active'));
app.listen(port, () => console.log(`Server port: ${port}`));