const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 8000;

// ১. CORS সেটিংস
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

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.u6o9fcg.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
const client = new MongoClient(uri, { serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true } });

// ২. VerifyToken (হেডার থেকে টোকেন নিবে)
const verifyToken = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).send({ message: 'Unauthorized' });
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) return res.status(401).send({ message: 'Unauthorized' });
        req.user = decoded;
        next();
    });
};

async function run() {
    try {
        const db = client.db("driveFleetDB");
        const carCollection = db.collection("cars");
        const bookingCollection = db.collection("bookings");

        app.post('/jwt', async (req, res) => {
            const token = jwt.sign(req.body, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '10h' });
            res.send({ token });
        });

        // --- Cars CRUD (সব জায়গায় /cars ব্যবহার করা হয়েছে) ---
        
        app.get('/cars', async (req, res) => {
            const { search, filter } = req.query;
            let query = {};
            if (search) query.name = { $regex: search, $options: 'i' };
            if (filter && filter !== 'All') query.type = filter;
            res.send(await carCollection.find(query).toArray());
        });

        // আইডি দিয়ে গাড়ি আনা (বানান: /cars/:id)
        app.get('/cars/:id', async (req, res) => {
            try {
                const id = req.params.id;
                const result = await carCollection.findOne({ _id: new ObjectId(id) });
                if (!result) return res.status(404).send({ message: "Not found" });
                res.send(result);
            } catch (err) {
                res.status(400).send({ message: "Invalid ID format" });
            }
        });

        app.post('/cars', verifyToken, async (req, res) => {
            res.send(await carCollection.insertOne(req.body));
        });

        app.get('/my-cars/:email', verifyToken, async (req, res) => {
            res.send(await carCollection.find({ ownerEmail: req.params.email }).toArray());
        });

        app.put('/cars/:id', verifyToken, async (req, res) => {
            const filter = { _id: new ObjectId(req.params.id) };
            res.send(await carCollection.updateOne(filter, { $set: req.body }));
        });

        app.delete('/cars/:id', verifyToken, async (req, res) => {
            res.send(await carCollection.deleteOne({ _id: new ObjectId(req.params.id) }));
        });

        // --- Bookings ---
        app.post('/bookings', verifyToken, async (req, res) => {
            const result = await bookingCollection.insertOne(req.body);
            await carCollection.updateOne({ _id: new ObjectId(req.body.carId) }, { $inc: { booking_count: 1 } });
            res.send(result);
        });

        app.get('/my-bookings/:email', verifyToken, async (req, res) => {
            res.send(await bookingCollection.find({ userEmail: req.params.email }).toArray());
        });

        console.log("MongoDB Connected!");
    } finally {}
}
run().catch(console.dir);
app.get('/', (req, res) => res.send('API Running'));
app.listen(port, () => console.log(`Server: ${port}`));