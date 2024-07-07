"use strict";
// https://zimpricecheck.com/price-updates/official-and-black-market-exchange-rates/

const zigToUsdConversionRate = 0.0730; // hardcoded rate for ZiG to USD - scrap later
const usdToZigConversionRate = 1 / zigToUsdConversionRate;

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

const fetchConfig = async () => {
    try {
        const res = await fetch("config.json");
        if (!res.ok) {
            throw new Error("Network res error");
        }
        const config = await res.json();
        const apiSecret = config.API_SECRET;
        console.log("API Secret:", apiSecret);

        await fetchApiData(apiSecret);
    } catch (error) {
        console.error("fetchConfig err:", error);
    }
};

const fetchApiData = async (apiSecret) => {
    try {
        const apiUrl = `https://v6.exchangerate-api.com/v6/8a8edde2a4ac1fc683a3698f/latest/USD`;
        const apiResponse = await fetch(apiUrl);
        if (!apiResponse.ok) {
            throw new Error("Failed fetchApiData()");
        }

        const data = await apiResponse.json();
        return data;
    } catch (error) {
        console.error("Error:", error);
        return null;
    }
};

const convertZigToForex = async () => {
    const zigAmount = parseFloat(document.getElementById("zigAmount").value);
    const selectedCurrency = document.getElementById("selectableCurrency").value;
    // console.log("zigAmount:", zigAmount);

    const data = await fetchApiData();
    if (!data) {
        console.error("No data available to convertZigToForex.");
        return;
    }

    if (!isNaN(zigAmount) && zigAmount > 0) {
        let conversionRate = (zigAmount * zigToUsdConversionRate) * data.conversion_rates[selectedCurrency];
        document.getElementById("foreXAmount").value = conversionRate.toFixed(2);
    }
};

const convertForexToZig = async () => {
    const foreXAmount = parseFloat(document.getElementById("foreXAmount").value);
    const selectedCurrency = document.getElementById("selectableCurrency").value;
    // console.log("foreXAmount:", foreXAmount);

    const data = await fetchApiData();
    if (!data) {
        console.error("No data available to convertForexToZig.");
        return;
    }

    if (!isNaN(foreXAmount) && foreXAmount > 0) {
        let conversionRate = (foreXAmount / data.conversion_rates[selectedCurrency]) / zigToUsdConversionRate;
        // console.log("conversionRate:", conversionRate);
        document.getElementById("zigAmount").value = conversionRate.toFixed(2);
    }
};

const renderChart = async () => {
    const ctx = document.getElementById("myChart");
    const data = await fetchApiData();

    if (!data) {
        console.error("No data available to render chart.");
        return;
    }

    const currencies = [
        "USD", "GBP", "EUR",
        "NAD", "ZiG", "AUD",
        "ZAR", "MZN", "AED",
        "BWP", "ZMW"
    ];

    const rates = currencies.map(currency => {
        if (currency === "ZiG") {
            return (usdToZigConversionRate);
        } else {
            return data.conversion_rates[currency];
        }
    });
    // console.log("rates:", rates, "currencies:", currencies);

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

const updateDisplayElems = async () => {
    const selectedCurrency = document.getElementById("selectableCurrency").value;

    const data = await fetchApiData();
    if (!data) {
        console.error("No data available to update display elems.");
        return;
    }

    const lastUpdate = data.time_last_update_utc.slice(0, -6);

    document.getElementById("text-muted").textContent = `Updated ${lastUpdate}`;
    document.getElementById("conversionDescription").textContent = `Convert Zimbabwe ZiG to ${selectedCurrency}`;
    document.getElementById("rateDisplay").textContent = `1 Ziggy Marley = ${zigToUsdConversionRate} USD`;
};

document.addEventListener("DOMContentLoaded", () => {
    registerServiceWorker();
    updateDisplayElems();
    renderChart();

    const zigAmount = document.getElementById("zigAmount");
    const foreXAmount = document.getElementById("foreXAmount");
    const selectableCurrency = document.getElementById("selectableCurrency");

    zigAmount.addEventListener("input", () => {
        // clear forex amount before converting
        foreXAmount.value = "";
        convertZigToForex();
    });

    foreXAmount.addEventListener("input", () => {
        // clear zig amount before converting
        zigAmount.value = "";
        convertForexToZig();
    });

    selectableCurrency.addEventListener("change", () => {
        updateDisplayElems();
        // convert based on whichever field has value
        if (zigAmount.value) {
            convertZigToForex();
        } else if (foreXAmount.value) {
            convertForexToZig();
        }
    });

    const clearButton = document.getElementById("clearButton");
    clearButton.addEventListener("click", () => {
        document.getElementById("zigAmount").value = "";
        document.getElementById("foreXAmount").value = "";
    });
});
