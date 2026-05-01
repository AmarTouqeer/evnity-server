const dotenv = require("dotenv");
const mongoose = require("mongoose");
const readline = require("readline");
const User = require("../models/User");

// Load environment variables
dotenv.config();

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Promisify question
const question = (query) =>
  new Promise((resolve) => rl.question(query, resolve));

// Connect to database
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/evnity", {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("✅ MongoDB Connected");
  } catch (error) {
    console.error("❌ MongoDB Connection Error:", error.message);
    process.exit(1);
  }
};

// Create admin user
const createAdmin = async () => {
  try {
    await connectDB();

    console.log("\n" + "=".repeat(50));
    console.log("🔐 Create Admin Account");
    console.log("=".repeat(50) + "\n");

    // Get admin details
    const name =
      (await question("Enter admin name (default: Admin): ")) || "Admin";
    const email =
      (await question("Enter admin email (default: admin@evnity.com): ")) ||
      "admin@evnity.com";
    const password =
      (await question("Enter admin password (default: Admin@123456): ")) ||
      "Admin@123456";
    const phone =
      (await question("Enter admin phone (default: 03001234567): ")) ||
      "03001234567";
    const city =
      (await question("Enter admin city (default: Lahore): ")) || "Lahore";

    // Check if admin already exists
    const existingAdmin = await User.findOne({ email });
    if (existingAdmin) {
      console.log("\n❌ Admin with this email already exists!");

      const update = await question(
        "\nDo you want to update the password? (yes/no): "
      );
      if (update.toLowerCase() === "yes" || update.toLowerCase() === "y") {
        const newPassword = await question("Enter new password: ");
        existingAdmin.password = newPassword;
        await existingAdmin.save();
        console.log("\n✅ Admin password updated successfully!");
      }

      rl.close();
      process.exit(0);
    }

    // Create admin user
    const admin = await User.create({
      name,
      email,
      password,
      phone,
      city,
      address: "Admin Office",
      role: "admin",
      isEmailVerified: true,
      isActive: true,
    });

    console.log("\n" + "=".repeat(50));
    console.log("✅ Admin Account Created Successfully!");
    console.log("=".repeat(50));
    console.log(`📧 Email: ${admin.email}`);
    console.log(`🔑 Password: ${password}`);
    console.log(`👤 Name: ${admin.name}`);
    console.log(`📱 Phone: ${admin.phone}`);
    console.log(`🏙️ City: ${admin.city}`);
    console.log("=".repeat(50));
    console.log(
      "\n⚠️  IMPORTANT: Please change the password after first login!\n"
    );

    rl.close();
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Error creating admin:", error.message);
    rl.close();
    process.exit(1);
  }
};

// Run the script
createAdmin();
