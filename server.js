import dotenv from "dotenv";
import express from "express";
import cors from "cors";

dotenv.config();

const app = express();

app.use(cors({
    origin: [
        "https://joshua12726.github.io",
        "https://intern7zsa.net",
        "http://localhost:5500"
    ],
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"]
}));

app.use(express.json());

const PAYMONGO_URL = "https://api.paymongo.com/v1";

function getAuthHeader() {
    const key = process.env.PAYMONGO_SECRET_KEY;

    if (!key) {
        throw new Error("PAYMONGO_SECRET_KEY is missing");
    }

    return "Basic " +
        Buffer.from(key + ":").toString("base64");
}


// HEALTH CHECK
app.get("/", (req, res) => {
    res.json({
        status: "PayMongo backend is running"
    });
});


// CREATE GCASH CHECKOUT
app.post("/api/qrph-checkout", async (req, res) => {

    try {

        console.log("Received order:", req.body);

        const {
            total,
            amount,
            firstName,
            lastName,
            email
        } = req.body;

        const orderTotal = Number(total || amount);

        if (!orderTotal || orderTotal <= 0) {
            return res.status(400).json({
                error: "Invalid order amount"
            });
        }

        const amountCentavos = Math.round(orderTotal * 100);


        // STEP 1: CREATE PAYMENT INTENT
        const intentResponse = await fetch(
            PAYMONGO_URL + "/payment_intents",
            {
                method: "POST",

                headers: {
                    "Content-Type": "application/json",
                    "Authorization": getAuthHeader()
                },

                body: JSON.stringify({
                    data: {
                        attributes: {
                            amount: amountCentavos,
                            currency: "PHP",

                            payment_method_allowed: [
                                "gcash"
                            ],

                            description: "Electro Store Order"
                        }
                    }
                })
            }
        );

        const intentData = await intentResponse.json();

        console.log("Payment Intent:", intentData);

        if (!intentResponse.ok) {
            return res
                .status(intentResponse.status)
                .json({
                    error:
                        intentData.errors?.[0]?.detail ||
                        "Failed to create Payment Intent",

                    details: intentData
                });
        }

        const paymentIntentId = intentData.data.id;


        // STEP 2: CREATE GCASH PAYMENT METHOD
        const methodResponse = await fetch(
            PAYMONGO_URL + "/payment_methods",
            {
                method: "POST",

                headers: {
                    "Content-Type": "application/json",
                    "Authorization": getAuthHeader()
                },

                body: JSON.stringify({
                    data: {
                        attributes: {
                            type: "gcash",

                            billing: {
                                name:
                                    `${firstName || ""} ${lastName || ""}`.trim(),

                                email: email || ""
                            }
                        }
                    }
                })
            }
        );

        const methodData = await methodResponse.json();

        console.log("Payment Method:", methodData);

        if (!methodResponse.ok) {
            return res
                .status(methodResponse.status)
                .json({
                    error:
                        methodData.errors?.[0]?.detail ||
                        "Failed to create GCash Payment Method",

                    details: methodData
                });
        }

        const paymentMethodId = methodData.data.id;


        // STEP 3: ATTACH GCASH PAYMENT METHOD
        const attachResponse = await fetch(
            PAYMONGO_URL +
            "/payment_intents/" +
            paymentIntentId +
            "/attach",

            {
                method: "POST",

                headers: {
                    "Content-Type": "application/json",
                    "Authorization": getAuthHeader()
                },

                body: JSON.stringify({
                    data: {
                        attributes: {
                            payment_method: paymentMethodId,

                            return_url:
                                "https://intern7zsa.net/payment-success.html"
                        }
                    }
                })
            }
        );

        const attachData = await attachResponse.json();

        console.log("Attach Payment:", attachData);

        if (!attachResponse.ok) {
            return res
                .status(attachResponse.status)
                .json({
                    error:
                        attachData.errors?.[0]?.detail ||
                        "Failed to attach GCash payment",

                    details: attachData
                });
        }


        // SEND RESPONSE TO FRONTEND
        res.json({
            success: true,
            payment_intent_id: paymentIntentId,
            data: attachData.data
        });

    } catch (error) {

        console.error("SERVER ERROR:", error);

        res.status(500).json({
            error: error.message
        });
    }

});


// CHECK PAYMENT STATUS
app.get("/api/payment-status", async (req, res) => {

    try {

        const id = req.query.id;

        if (!id) {
            return res.status(400).json({
                error: "Payment ID required"
            });
        }

        const response = await fetch(
            PAYMONGO_URL +
            "/payment_intents/" +
            encodeURIComponent(id),

            {
                headers: {
                    "Authorization": getAuthHeader()
                }
            }
        );

        const data = await response.json();

        res.status(response.status).json(data);

    } catch (error) {

        console.error("STATUS ERROR:", error);

        res.status(500).json({
            error: error.message
        });
    }

});


const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {

    console.log("");
    console.log("==============================");
    console.log("PayMongo server running!");
    console.log("http://localhost:" + PORT);
    console.log("==============================");

});
export default app;
