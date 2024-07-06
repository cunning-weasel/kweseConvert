"use strict";
// https://zimpricecheck.com/price-updates/official-and-black-market-exchange-rates/

const zigToUsdRate = 0.0730; // hardcoded rate for ZiG to USD - scrap later
let exchangeRatesData = null;

const registerServiceWorker = async () => {
    if ("serviceWorker" in navigator) {
        try {
            const registration = await navigator.serviceWorker.register("/service-worker.js", {
                scope: "/",
            });
            if (registration.installing) {
                console.log("Service worker installing");
            } else if (registration.waiting) {
                console.log("Service worker installed");
            } else if (registration.active) {
                console.log("Service worker active");
            }
        } catch (error) {
            console.error(`Registration failed with ${error}`);
        }
    }
};

const fetchData = async () => {
    try {
        const apiUrl = `https://v6.exchangerate-api.com/v6/8a8edde2a4ac1fc683a3698f/latest/USD`;
        const apiResponse = await fetch(apiUrl);
        if (!apiResponse.ok) {
            throw new Error("Failed to fetch data from echangeRate API");
        }

        const data = await apiResponse.json();
        // console.log("data:", data);
        return data;
    } catch (error) {
        console.error("Error:", error);
        return null;
    }
};

const convertCurrency = () => {
    const amount = document.getElementById("amount").value;
    const selectedCurrency = document.getElementById("selectableCurrency").value;

    const converted = amount * zigToUsdRate;
    document.getElementById("converted").value = converted.toFixed(2);
};

const renderData = async () => {
    const ctx = document.getElementById("myChart");
    const data = await fetchData();

    if (!data) {
        console.error("No data available to render chart.");
        return;
    }

    const currencies = [
        "BWP", "GBP", "EUR",
        "NAD", "ZiG", "AUD",
        "ZAR", "MZN", "AED",
        "USD"
    ];

    const rates = currencies.map(currency => {
        if (currency === "ZiG") {
            return zigToUsdRate;
        } else {
            return data.conversion_rates[currency];
        }
    });
    console.log("rates:", rates, "currencies:", currencies);

    new Chart(ctx, {
        type: "bar",
        data: {
            labels: currencies,
            datasets: [{
                label: "All rates against 1 USD",
                data: rates,
                backgroundColor: [
                    "rgba(255, 99, 132, 0.2)",
                    "rgba(255, 159, 64, 0.2)",
                    "rgba(255, 205, 86, 0.2)",
                    "rgba(75, 192, 192, 0.2)",
                    "rgba(54, 162, 235, 0.2)",
                    "rgba(153, 102, 255, 0.2)",
                    "rgba(201, 203, 207, 0.2)",
                    "rgba(255, 0, 0, 0.2)",
                    "rgba(128, 0, 128, 0.2)"
                ],
                borderColor: [
                    "rgb(255, 99, 132)",
                    "rgb(255, 159, 64)",
                    "rgb(255, 205, 86)",
                    "rgb(75, 192, 192)",
                    "rgb(54, 162, 235)",
                    "rgb(153, 102, 255)",
                    "rgb(201, 203, 207)",
                    "rgb(255, 0, 0)",
                    "rgb(128, 0, 128)"
                ],
                borderWidth: 1
            }]
        },
        options: {
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
};

document.addEventListener("DOMContentLoaded", () => {
    registerServiceWorker();
    renderData();

    const amount = document.getElementById("amount");
    amount.addEventListener("input", convertCurrency);

    const clearButton = document.getElementById("clearButton");
    clearButton.addEventListener("click", () => {
        // Reset all values to 0
        document.getElementById("amount").value = "";
        document.getElementById("converted").value = "";
    });
});
