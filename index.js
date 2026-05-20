const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 8000;

// --- 1. CORS Configuration (সব ভার্সেল লিঙ্ককে অনুমতি দিবে) ---
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

// --- 2. MongoDB Connection ---
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.u6o9fcg.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

// --- 3. Verify Token Middleware (Header Based) ---
const verifyToken = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send({ message: 'unauthorized access' });
    }
    const token = authHeader.split(' ')[1];
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

        // --- 4. Authentication API (JWT) ---
        app.post('/jwt', async (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '10h' });
            res.send({ token });
        });

        // --- 5. CARS APIs (CRUD) ---

        // রিকোয়ারমেন্ট: সব গাড়ি আনা (Search & Filter সহ)
        app.get('/cars', async (req, res) => {
            const { search, filter } = req.query;
            let query = {};
            if (search) query.name = { $regex: search, $options: 'i' };
            if (filter && filter !== 'All') query.type = filter;
            const result = await carCollection.find(query).toArray();
            res.send(result);
        });

        // রিকোয়ারমেন্ট: নির্দিষ্ট একটি গাড়ির তথ্য আনা (Details & Update এর জন্য)
        app.get('/car/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await carCollection.findOne(query);
            if (!result) return res.status(404).send({ message: "Car not found" });
            res.send(result);
        });

        // রিকোয়ারমেন্ট: নতুন গাড়ি অ্যাড করা (Private Route)
        app.post('/cars', verifyToken, async (req, res) => {
            const result = await carCollection.insertOne(req.body);
            res.send(result);
        });

        // রিকোয়ারমেন্ট: ইউজারের নিজের অ্যাড করা গাড়িগুলো আনা
        app.get('/my-cars/:email', verifyToken, async (req, res) => {
            if (req.user.email !== req.params.email) return res.status(403).send({ message: 'Forbidden access' });
            const result = await carCollection.find({ ownerEmail: req.params.email }).toArray();
            res.send(result);
        });

        // রিকোয়ারমেন্ট: গাড়ি আপডেট করা (Update functionality)
        app.put('/car/:id', verifyToken, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updatedCar = req.body;
            const updateDoc = {
                $set: {
                    name: updatedCar.name,
                    dailyPrice: updatedCar.dailyPrice,
                    type: updatedCar.type,
                    location: updatedCar.location,
                    description: updatedCar.description,
                    image: updatedCar.image,
                },
            };
            const result = await carCollection.updateOne(filter, updateDoc, { upsert: true });
            res.send(result);
        });

        // রিকোয়ারমেন্ট: গাড়ি ডিলিট করা (Delete functionality)
        app.delete('/car/:id', verifyToken, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await carCollection.deleteOne(query);
            res.send(result);
        });

        // --- 6. BOOKING APIs ---

        // রিকোয়ারমেন্ট: গাড়ি বুক করা এবং বুকিং কাউন্ট ১ বাড়ানো ($inc)
        app.post('/bookings', verifyToken, async (req, res) => {
            const bookingData = req.body;
            const result = await bookingCollection.insertOne(bookingData);
            
            // $inc ব্যবহার করে booking_count বাড়ানো
            const carIdFilter = { _id: new ObjectId(bookingData.carId) };
            await carCollection.updateOne(carIdFilter, { $inc: { booking_count: 1 } });
            
            res.send(result);
        });

        // রিকোয়ারমেন্ট: ইউজারের নিজের বুকিংগুলো আনা
        app.get('/my-bookings/:email', verifyToken, async (req, res) => {
            if (req.user.email !== req.params.email) return res.status(403).send({ message: 'Forbidden access' });
            const result = await bookingCollection.find({ userEmail: req.params.email }).toArray();
            res.send(result);
        });

        console.log("Successfully connected to MongoDB!");
    } finally {
        // Keep connection open
    }
}
run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('DriveFleet Production Server is Running...');
});

app.listen(port, () => {
    console.log(`Server is running on port: ${port}`);
});