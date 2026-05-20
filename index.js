const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 8000;

// ১. CORS সেটিংস
app.use(cors({
    origin: [
        'http://localhost:5173',
        'https://drive-fleet-client-sq3c.vercel.app',
        'https://drive-fleet-client-kuwbr0v8r-mdfizz655s-projects.vercel.app'
    ],
    credentials: true
}));
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.u6o9fcg.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
const client = new MongoClient(uri, { serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true } });

// ২. VerifyToken (এটি এখন হেডার থেকে টোকেন নিবে)
const verifyToken = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).send({ message: 'unauthorized access' });
    }
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).send({ message: 'unauthorized access' });
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

        // টোকেন জেনারেট এপিআই
        app.post('/jwt', async (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '10h' });
            res.send({ token }); // সরাসরি টোকেন বডিতে পাঠিয়ে দেওয়া
        });

        app.get('/cars', async (req, res) => {
            const { search, filter } = req.query;
            let query = {};
            if (search) query.name = { $regex: search, $options: 'i' };
            if (filter && filter !== 'All') query.type = filter;
            res.send(await carCollection.find(query).toArray());
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

        app.post('/bookings', verifyToken, async (req, res) => {
            const bookingData = req.body;
            const result = await bookingCollection.insertOne(bookingData);
            await carCollection.updateOne({ _id: new ObjectId(bookingData.carId) }, { $inc: { booking_count: 1 } });
            res.send(result);
        });

        app.get('/my-bookings/:email', verifyToken, async (req, res) => {
            res.send(await bookingCollection.find({ userEmail: req.params.email }).toArray());
        });

        console.log("MongoDB Connected!");
    } finally {}
}
run().catch(console.dir);
app.get('/', (req, res) => res.send('API Active'));
app.listen(port, () => console.log(`Server: ${port}`));