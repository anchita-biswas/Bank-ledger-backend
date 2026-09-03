require("dotenv").config();

/**
 * - Some local networks fail to resolve the mongodb+srv record through the
 *   system resolver. Public resolvers are forced only outside production, so
 *   the host platform keeps its own DNS in the deployed environment.
 */
if (process.env.NODE_ENV !== "production") {
  require("dns").setServers(["8.8.8.8", "1.1.1.1"]);
}

const app = require("./src/app");
const connectToDB = require("./src/config/db");

connectToDB();

/**
 * - Render assigns the port through the environment, so it must not be
 *   hardcoded. 3000 is only the local fallback.
 */
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
