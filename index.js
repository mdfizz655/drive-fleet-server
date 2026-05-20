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
        'https://drive-fleet-client-kuwbr0v8r-mdfizz655s-projects.vercel.app'
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
        return res.status(401).send({ message: 'Unauthorized access: No token' });
    }
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).send({ message: 'Unauthorized access: Invalid token' });
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

        // --- 4. Auth & JWT ---
        app.post('/jwt', async (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '5h' });

            res.cookie('token', token, {
                httpOnly: true,
                secure: true,      // প্রোডাকশনে এটি অবশ্যই true
                sameSite: 'none',  // আলাদা ডোমেইনের জন্য এটি none
                maxAge: 3600000 * 5, 
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

        // --- 5. Cars APIs ---
        app.get('/cars', async (req, res) => {
            const { search, filter } = req.query;
            let query = {};
            if (search) query.name = { $regex: search, $options: 'i' };
            if (filter && filter !== 'All') query.type = filter;
            const result = await carCollection.find(query).toArray();
            res.send(result);
        });

        app.get('/car/:id', async (req, res) => {
            const id = req.params.id;
            const result = await carCollection.findOne({ _id: new ObjectId(id) });
            res.send(result);
        });

        app.post('/cars', verifyToken, async (req, res) => {
            const result = await carCollection.insertOne(req.body);
            res.send(result);
        });

        app.get('/my-cars/:email', verifyToken, async (req, res) => {
            if (req.user.email !== req.params.email) return res.status(403).send({ message: 'Forbidden' });
            const result = await carCollection.find({ ownerEmail: req.params.email }).toArray();
            res.send(result);
        });

        app.put('/car/:id', verifyToken, async (req, res) => {
            const id = req.params.id;
            const result = await carCollection.updateOne({ _id: new ObjectId(id) }, { $set: req.body });
            res.send(result);
        });

        app.delete('/car/:id', verifyToken, async (req, res) => {
            const result = await carCollection.deleteOne({ _id: new ObjectId(req.params.id) });
            res.send(result);
        });

        // --- 6. Booking APIs ---
        app.post('/bookings', verifyToken, async (req, res) => {
            const bookingData = req.body;
            const result = await bookingCollection.insertOne(bookingData);
            
            // রিকোয়ারমেন্ট: booking_count ১ বাড়ানো
            await carCollection.updateOne(
                { _id: new ObjectId(bookingData.carId) },
                { $inc: { booking_count: 1 } }
            );
            res.send(result);
        });

        app.get('/my-bookings/:email', verifyToken, async (req, res) => {
            if (req.user.email !== req.params.email) return res.status(403).send({ message: 'Forbidden' });
            const result = await bookingCollection.find({ userEmail: req.params.email }).toArray();
            res.send(result);
        });

        console.log("Successfully connected to MongoDB!");
    } finally {}
}
run().catch(console.dir);
app.get('/', (req, res) => res.send('DriveFleet API is Running...'));
app.listen(port, () => console.log(`Server port: ${port}`));