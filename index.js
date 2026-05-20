const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 8000;

// --- 1. Dynamic CORS Setup (সব ভার্সেল লিঙ্ক কাজ করবে) ---
app.use(cors({
    origin: function (origin, callback) {
        if (!origin || origin.includes('vercel.app') || origin.includes('localhost')) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
}));

app.use(express.json());
app.use(cookieParser());

// --- 2. MongoDB Connection ---
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.u6o9fcg.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
    serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true }
});

// --- 3. Verify Token Middleware with Logs ---
const verifyToken = (req, res, next) => {
    const token = req?.cookies?.token;
    console.log('--- Token Check ---', token ? "Token Found" : "No Token in Cookie");

    if (!token) {
        return res.status(401).send({ message: 'Unauthorized: No token' });
    }
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
            console.log('JWT Error:', err.message);
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

        // --- Auth APIs ---
        app.post('/jwt', async (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '10h' });

            res.cookie('token', token, {
                httpOnly: true,
                secure: true,      
                sameSite: 'none',
                maxAge: 36000000, 
                path: '/'
            }).send({ success: true });
        });

        app.post('/logout', (req, res) => {
            res.clearCookie('token', {
                httpOnly: true,
                secure: true,
                sameSite: 'none',
                path: '/'
            }).send({ success: true });
        });

        // --- Cars CRUD APIs ---
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

        console.log("MongoDB Connected!");
    } finally {}
}
run().catch(console.dir);
app.get('/', (req, res) => res.send('DriveFleet Active'));
app.listen(port, () => console.log(`Running on port: ${port}`));