import dotenv from "dotenv";
import express from "express";
import cors from "cors";

dotenv.config();

const app = express();

app.use(cors({
    origin: "*",
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"]
}));

app.use(express.json());

const PAYMONGO_URL = "https://api.paymongo.com/v1";

function getAuthHeader() {
    const key = process.env.PAYMONGO_SECRET_KEY;

    if (!key) {
        throw new Error("PAYMONGO_SECRET_KEY is missing");
    }

    return "Basic " + Buffer.from(key + ":").toString("base64");
}

app.get("/api", (req, res) => {
    res.json({
        status: "PayMongo QRPh backend is running"
    });
});

app.post("/api/qrph-checkout", async (req, res) => {
    try {
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

        // 1. Create Payment Intent
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
                            payment_method_allowed: ["qrph"],
                            description: "Electro Store Order"
                        }
                    }
                })
            }
        );

        const intentData = await intentResponse.json();

        if (!intentResponse.ok) {
            return res.status(intentResponse.status).json({
                error:
                    intentData.errors?.[0]?.detail ||
                    "Failed to create Payment Intent",
                details: intentData
            });
        }

        const paymentIntentId = intentData.data.id;

        // 2. Create QRPh Payment Method
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
                            type: "qrph",
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

        if (!methodResponse.ok) {
            return res.status(methodResponse.status).json({
                error:
                    methodData.errors?.[0]?.detail ||
                    "Failed to create QRPh Payment Method",
                details: methodData
            });
        }

        const paymentMethodId = methodData.data.id;

        // 3. Attach QRPh Payment Method
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

        if (!attachResponse.ok) {
            return res.status(attachResponse.status).json({
                error:
                    attachData.errors?.[0]?.detail ||
                    "Failed to attach QRPh payment",
                details: attachData
            });
        }

        // 4. Return payment information
        res.json({
            success: true,
            payment_intent_id: paymentIntentId,
            payment_method_id: paymentMethodId,
            data: attachData.data
        });

    } catch (error) {
        console.error("QRPH SERVER ERROR:", error);

        res.status(500).json({
            error: error.message
        });
    }
});

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
        res.status(500).json({
            error: error.message
        });
    }
});

app.post("/api/test", (req, res) => {
    res.json({
        success: true,
        body: req.body
    });
});

export default app;
