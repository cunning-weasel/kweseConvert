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
        const apiUrlPair = `https://v6.exchangerate-api.com/v6/8a8edde2a4ac1fc683a3698f/pair/USD/ZAR`;

        const apiResponse = await fetch(apiUrl);
        const apiResponsePair = await fetch(apiUrlPair);
        if (!apiResponse.ok || !apiResponsePair) {
            throw new Error("Failed to fetch data from echangeRate API");
        }
        const data = await apiResponse.json();
        const dataPair = await apiResponsePair.json();
        console.log("data:", data);
        console.log("dataPair:", dataPair);
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

    // need: USD, ZAR, GBP, BWP, ZiG, EUR, NAD, MZN, ZWL
    // const labels = Object.keys(data.rates);
    // const rates = Object.values(data.conversion_rates);

    new Chart(ctx, {
        type: "bar",
        data: {
            labels: ["Red", "Blue", "Yellow", "Green", "Purple", "Orange"],
            datasets: [{
                label: "Rates at a glance",
                data: [12, 19, 3, 5, 2, 3],
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
