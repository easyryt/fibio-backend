import app from "./src/app.js";
import { connectDB } from "./src/config/db.js";
import { createCustomerAuth } from "./src/config/customerAuth.js";
import { config } from "./src/config/config.js";

const startServer = async () => {
  await connectDB();
  await createCustomerAuth();

  app.listen(config.port, () => {
    console.log(`Server running on - ${config.port}`);
  });
};

startServer();