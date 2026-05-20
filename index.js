
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 8000;

// --- 1. Middleware ---
app.use(cors({
    origin: ['https://drive-fleet-client-sq3c.vercel.app'],
    credentials: true
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
        return res.status(401).send({ message: 'Unauthorized Access' });
    }
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).send({ message: 'Unauthorized Access' });
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

        // --- 4. Auth Related API ---
        app.post('/jwt', async (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
            res.cookie('token', token, { httpOnly: true, secure: false, sameSite: 'lax' }).send({ success: true });
        });

        app.post('/logout', (req, res) => {
            res.clearCookie('token', { httpOnly: true, secure: false, sameSite: 'lax' }).send({ success: true });
        });

        // --- 5. Cars CRUD APIs ---

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
            const email = req.params.email;
            if (req.user.email !== email) return res.status(403).send({ message: 'Forbidden' });
            const result = await carCollection.find({ ownerEmail: email }).toArray();
            res.send(result);
        });

        app.put('/car/:id', verifyToken, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updateDoc = { $set: req.body };
            const result = await carCollection.updateOne(filter, updateDoc);
            res.send(result);
        });

        app.delete('/car/:id', verifyToken, async (req, res) => {
            const id = req.params.id;
            const result = await carCollection.deleteOne({ _id: new ObjectId(id) });
            res.send(result);
        });

        // --- 6. Bookings APIs ---

        app.post('/bookings', verifyToken, async (req, res) => {
            const bookingData = req.body;
            // বুকিং সেভ করা
            const result = await bookingCollection.insertOne(bookingData);

            // রিকোয়ারমেন্ট: গাড়ির booking_count ১ বাড়ানো ($inc ব্যবহার করে)
            const carIdFilter = { _id: new ObjectId(bookingData.carId) };
            const updateDoc = { $inc: { booking_count: 1 } };
            await carCollection.updateOne(carIdFilter, updateDoc);

            res.send(result);
        });

        app.get('/my-bookings/:email', verifyToken, async (req, res) => {
            const email = req.params.email;
            if (req.user.email !== email) return res.status(403).send({ message: 'Forbidden' });
            const result = await bookingCollection.find({ userEmail: email }).toArray();
            res.send(result);
        });

        console.log("Successfully connected to MongoDB!");
    } finally {}
}
run().catch(console.dir);
app.listen(port, () => console.log(`Server running on port: ${port}`));