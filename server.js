require("dotenv").config();
const express = require("express");
const cors = require("cors");

const { router: authRouter } = require("./src/routes/auth");
const profilesRouter = require("./src/routes/profiles");
const swipesRouter = require("./src/routes/swipes");
const matchesRouter = require("./src/routes/matches");
const followsRouter = require("./src/routes/follows");

const app = express();
app.use(cors());
app.use(express.json());

// Health check — hit this first once deployed to confirm the pipeline works
app.get("/health", (req, res) => res.json({ ok: true, service: "streamswipe-api" }));

app.use("/auth", authRouter);
app.use("/profiles", profilesRouter);
app.use("/swipes", swipesRouter);
app.use("/matches", matchesRouter);
app.use("/follows", followsRouter);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`streamswipe-api listening on port ${PORT}`));
