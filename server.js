require("dotenv").config();
const express = require("express");
const cors = require("cors");

const { router: authRouter } = require("./src/routes/auth");
const profilesRouter = require("./src/routes/profiles");
const swipesRouter = require("./src/routes/swipes");
const matchesRouter = require("./src/routes/matches");
const followsRouter = require("./src/routes/follows");
const blocksRouter = require("./src/routes/blocks");
const reportsRouter = require("./src/routes/reports");
const waitlistRouter = require("./src/routes/waitlist");

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => res.json({ ok: true, service: "streamteam-api" }));

app.use("/auth", authRouter);
app.use("/profiles", profilesRouter);
app.use("/swipes", swipesRouter);
app.use("/matches", matchesRouter);
app.use("/follows", followsRouter);
app.use("/blocks", blocksRouter);
app.use("/reports", reportsRouter);
app.use("/waitlist", waitlistRouter);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`streamteam-api listening on port ${PORT}`));
