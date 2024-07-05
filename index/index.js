"use strict";
// https://zimpricecheck.com/price-updates/official-and-black-market-exchange-rates/

// service worker
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

const zigToUsdRate = 0.0727; // hardcoded rate for ZiG to USD - zimpricecheck

const convertCurrency = () => {
    const amount = document.getElementById("amount").value;
    const converted = amount * zigToUsdRate;
    document.getElementById("converted").value = converted.toFixed(4);
};

const callAPis = async () => {
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

const renderChart = async () => {
    const ctx = document.getElementById("myChart");
    const data = await callAPis();

    if (!data) {
        console.error("No data available to render chart.");
        return;
    }

    const currencies = ["GBP", "EUR", "NAD", "MZN", "ZiG"];
    // const ratesCountry = Object.keys(data.conversion_rates);
    // const ratesVal = Object.values(data.conversion_rates);
    // Object.entries(data.conversion_rates).forEach(([key, value]) => {
    //     console.log(`${key} ${value}`)
    // });

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
                label: "Rates against 1 USD",
                data: rates,
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

    // new Chart(ctx, {
    //     type: "line",
    //     data: {
    //         labels: ["db_res", "db_res", "db_res", "db_res", "db_res", "db_res"],
    //         datasets: [{
    //             label: "ZiG to USD last 14 Days",
    //             data: [100, 65, 59, 81, 56, 40],
    //             borderWidth: 1
    //         }]
    //     },
    //     options: {
    //         scales: {
    //             y: {
    //                 beginAtZero: true
    //             }
    //         }
    //     }
    // });
};

document.addEventListener("DOMContentLoaded", () => {
    registerServiceWorker();
    renderChart();

    const convertButton = document.getElementById("convertButton");
    if (convertButton) {
        convertButton.addEventListener("click", convertCurrency);
    } else {
        console.error("Convert button not found.");
    }
});
