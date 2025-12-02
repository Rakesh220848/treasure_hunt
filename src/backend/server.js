require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const PORT = 5050;

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Middleware
app.use(cors({ origin: "https://trackrun-treasure.vercel.app" })); // Adjust as per frontend URL
app.use(bodyParser.json());

// Route to handle the location check and verification
// Route to handle the location check and verification
app.post("/check", async (req, res) => {
	const { qrData, teamNumber } = req.body;

	try {
		// Step 1: Retrieve team data from setlocation table
		const { data: setlocationData, error: teamError } = await supabase
			.from("setlocation")
			.select(
				"start, location1, location2, location3, location4, location5, end"
			)
			.eq("team", teamNumber)
			.single();

		if (teamError || !setlocationData) {
			return res.status(400).json({ message: "Invalid team number" });
		}

		// Step 2: Retrieve current status from verifylocation table
		const { data: verifylocationData, error: verifyError } = await supabase
			.from("verifylocation")
			.select(
				"start, location1, location2, location3, location4, location5, end"
			)
			.eq("team", teamNumber)
			.single();

		if (verifyError || !verifylocationData) {
			return res.status(500).json({ message: "Unexpected error occurred" });
		}

		// Step 3: Check if the start location is verified
		if (!verifylocationData.start) {
			if (qrData === setlocationData.start) {
				// Fetch hint for the first location
				const { data: locationHintData, error: hintError } = await supabase
					.from("location")
					.select("location_hint")
					.eq("location_code", setlocationData.location1)
					.single();

				if (hintError || !locationHintData) {
					return res
						.status(500)
						.json({ message: "Failed to fetch location hint" });
				}

				// Update start location in verifylocation
				const { error: updateError } = await supabase
					.from("verifylocation")
					.update({
						start: setlocationData.start,
						start_time: new Date().toISOString(),
					})
					.eq("team", teamNumber);

				if (updateError) {
					return res
						.status(500)
						.json({ message: "Failed to update start location" });
				}

				return res.status(200).json({
					correct: true,
					nextHint: `${locationHintData.location_hint}`,
				});
			} else {
				return res
					.status(400)
					.json({ correct: false, message: "Incorrect start location" });
			}
		}

		// Step 4: Check the next location to verify (location1 to location5)
		let locationIndex = null;
		let locationField = null;
		let nextHint = null;

		for (let i = 1; i <= 5; i++) {
			if (!verifylocationData[`location${i}`]) {
				locationIndex = i;
				locationField = `location${i}`;

				// Fetch hint for the next location
				const { data: nextLocationHintData, error: nextHintError } =
					await supabase
						.from("location")
						.select("location_hint")
						.eq("location_code", setlocationData[`location${i + 1}`])
						.single();

				nextHint =
					nextHintError || !nextLocationHintData
						? "Congo"
						: `${nextLocationHintData.location_hint}`;
				break;
			}
		}

		if (!locationField) {
			return res
				.status(400)
				.json({ message: "All locations have already been visited" });
		}

		// Step 4.1: Compare QR data with the current location field
		if (qrData === setlocationData[locationField]) {
			// Convert current time to IST
			const currentTimeIST = new Date(
				new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })
			).toISOString();

			// Update the verified location in verifylocation
			const { error: updateError } = await supabase
				.from("verifylocation")
				.update({
					[locationField]: setlocationData[locationField],
					[`${locationField}_time`]: currentTimeIST,
				})
				.eq("team", teamNumber);

			if (updateError) {
				return res.status(500).json({ message: "Failed to update location" });
			}

			// Insert the same data into the "check" table
			const { error: insertError } = await supabase.from("register").insert({
				team_name: teamNumber,
				time: new Date(
					new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })
				)
					.toTimeString()
					.split(" ")[0], // Save only the time
				location: setlocationData[locationField],
			});

			if (insertError) {
				return res
					.status(500)
					.json({ message: "Failed to log data in check table" });
			}

			return res.status(200).json({ correct: true, nextHint });
		} else {
			// Incorrect QR data
			return res
				.status(400)
				.json({ correct: false, message: "Wrong location" });
		}
	} catch (error) {
		console.error("Error processing request:", error.message);
		return res.status(500).json({ message: "Unexpected error occurred" });
	}
});

// New route to save locations to setlocation table
app.post("/save-locations", async (req, res) => {
	const { team, members } = req.body;

	if (!team || !members || members.length === 0) {
		return res.status(400).json({ error: "Invalid input data" });
	}

	try {
		// Step 1: Fetch all distinct locations except "CLG"
		const { data, error } = await supabase
			.from("location")
			.select("location_code")
			.neq("location_code", "CLG");

		console.log("Fetched data:", data);
		console.error("Error details:", error);

		// Step 2: Shuffle and pick 5 unique locations
		const uniqueLocations = [...data]
			.map((loc) => loc.location_code) // Extract location codes
			.sort(() => 0.5 - Math.random()) // Shuffle the array
			.slice(0, 5); // Pick the first 5 unique values

		if (new Set(uniqueLocations).size !== 5) {
			return res
				.status(500)
				.json({ error: "Failed to generate unique locations" });
		}

		// Step 3: Structure the data for insertion
		const locationData = {
			team: team,
			start: "CLG",
			location1: uniqueLocations[0],
			location2: uniqueLocations[1],
			location3: uniqueLocations[2],
			location4: uniqueLocations[3],
			location5: uniqueLocations[4],
			end: "CLG",
		};

		// Step 4: Insert team into `team_no` table
		const teamData = {
			team: team,
			member1: members[0] || null,
			member2: members[1] || null,
			member3: members[2] || null,
			member4: members[3] || null,
		};

		const { error: teamError } = await supabase
			.from("team_no")
			.insert([teamData]);

		if (teamError) {
			console.error("Error adding team:", teamError.message);
			return res.status(500).json({ error: "Failed to add team" });
		}

		// Step 5: Insert into `setlocation` table
		const { error: locationError } = await supabase
			.from("setlocation")
			.insert([locationData]);

		if (locationError) {
			console.error("Error saving locations:", locationError.message);
			return res.status(500).json({ error: "Failed to save locations" });
		}

		// Step 6: Create initial entry in `verifylocation` table
		const verifyData = {
			team: team,
			start: "CLG",
			location1: null,
			location2: null,
			location3: null,
			location4: null,
			location5: null,
			end: null,
		};

		const { error: verifyError } = await supabase
			.from("verifylocation")
			.insert([verifyData]);

		if (verifyError) {
			console.error("Error initializing verification:", verifyError.message);
			return res
				.status(500)
				.json({ error: "Failed to initialize verification" });
		}

		res.status(200).json({
			message: "Locations assigned successfully",
			locations: locationData,
		});
	} catch (error) {
		console.error("Unexpected error:", error.message);
		res.status(500).json({ error: "Unexpected error occurred" });
	}
});

app.get("/api/registered", async (req, res) => {
	try {
		const { data, error } = await supabase.from("register").select("*");
		if (error) throw error;
		res.json(data);
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
});

app.get("/ping", (req, res) => {
	console.log(`Keep-alive ping successful.`);
});

// Start the server
app.listen(PORT, () => {
	console.log(`Server is running on http://localhost:${PORT}`);
});
