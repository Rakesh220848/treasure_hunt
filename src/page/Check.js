import React, { useEffect, useState } from "react";
import "./Check.css";

const Check = () => {
	const [data, setData] = useState([]);

	// Function to fetch registered data
	const fetchData = () => {
		fetch("https://treasurehunt-8bkh.onrender.com/api/registered", {
			method: "GET",
			headers: { "Content-Type": "application/json" },
		})
			.then((response) => {
				if (!response.ok) {
					throw new Error("Network response was not ok");
				}
				return response.json();
			})
			.then((data) => setData(data))
			.catch((error) => console.error("Error fetching data:", error));
	};

	// Function to ping the backend
	const pingBackend = () => {
		fetch("https://treasurehunt-8bkh.onrender.com/api/ping", {
			method: "POST", // Assuming POST; change to GET if necessary
			headers: { "Content-Type": "application/json" },
			// body: JSON.stringify({ /* any required data */ }), // Include if needed
		})
			.then((response) => {
				if (!response.ok) {
					throw new Error("Ping failed");
				}
				return response.json();
			})
			.then((data) => {
				console.log("Ping successful:", data);
				// Optionally handle the response data
			})
			.catch((error) => console.error("Error pinging backend:", error));
	};

	useEffect(() => {
		// Fetch initial data
		fetchData();

		// Set up interval to ping backend every 30 seconds (30000 ms)
		const intervalId = setInterval(() => {
			pingBackend();
		}, 5000);

		// Optional: Fetch data periodically as well (e.g., every 30 seconds)
		const dataIntervalId = setInterval(() => {
			fetchData();
		}, 5000);

		// Clean up intervals on component unmount
		return () => {
			clearInterval(intervalId);
			clearInterval(dataIntervalId);
		};
	}, []);

	return (
		<div className="check-page">
			<h1>Location Visited with Time</h1>
			<button onClick={pingBackend} hidden>
				Ping Backend
			</button>
			<table border="1">
				<thead>
					<tr>
						<th>ID</th>
						<th>Team Name</th>
						<th>Location</th>
						<th>Time</th>
					</tr>
				</thead>
				<tbody>
					{data.map((row) => (
						<tr key={row.id}>
							<td>{row.id}</td>
							<td>{row.team_name}</td>
							<td>{row.location}</td>
							<td>{row.time}</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
};

export default Check;
