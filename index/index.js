"use strict";
// https://zimpricecheck.com/price-updates/official-and-black-market-exchange-rates/

const zigToUsdConversionRate = 0.0373; // official hardcoded rate for ZiG to USD i.e 1 / 17 = 0.0588
const usdToZigConversionRate = 1 / zigToUsdConversionRate;
const usdToZigLowestInformalSecConversionRate = 38.0000;
const usdToZigHighestInformalSecConversionRate = 45.0000;

function getUsdRate(currency) {
    if (currency === "ZiG") return usdToZigConversionRate;
    if (currency === "ZiG-Low") return usdToZigLowestInformalSecConversionRate;
    if (currency === "ZiG-High") return usdToZigHighestInformalSecConversionRate;
    return null; // for API currencies
}

function getToUsdRate(currency) {
    if (currency === "ZiG") return zigToUsdConversionRate;
    if (currency === "ZiG-Low") return 1 / usdToZigLowestInformalSecConversionRate;
    if (currency === "ZiG-High") return 1 / usdToZigHighestInformalSecConversionRate;
    return null; // also for API currencies
}

const convertCurrency = async (direction = "from") => {
    const fromAmountElem = document.getElementById("fromAmount");
    const toAmountElem = document.getElementById("toAmount");
    const fromCurrency = document.getElementById("fromCurrency").value;
    const toCurrency = document.getElementById("toCurrency").value;
    const data = await fetchApiData();
    if (!data) {
        console.error("No data available to convert.");
        return;
    }

    let fromAmount = parseFloat(fromAmountElem.value);
    let toAmount = parseFloat(toAmountElem.value);

    let fromToUsd = getToUsdRate(fromCurrency) || (1 / data.conversion_rates[fromCurrency]);
    let toToUsd = getToUsdRate(toCurrency) || (1 / data.conversion_rates[toCurrency]);
    let fromUsd = getUsdRate(fromCurrency) || data.conversion_rates[fromCurrency];
    let toUsd = getUsdRate(toCurrency) || data.conversion_rates[toCurrency];

    if (direction === "from" && !isNaN(fromAmount) && fromAmount > 0) {
        let usdValue = fromAmount * fromToUsd;
        let result = usdValue * toUsd;
        toAmountElem.value = result.toFixed(2);
    } else if (direction === "to" && !isNaN(toAmount) && toAmount > 0) {
        let usdValue = toAmount * toToUsd;
        let result = usdValue * fromUsd;
        fromAmountElem.value = result.toFixed(2);
    }
};

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

    if (navigator.storage && navigator.storage.persist) {
        try {
            const granted = await navigator.storage.persist();
            if (granted) {
                console.log("Storage will not be cleared except by explicit user action");
            } else {
                console.log("Storage may be cleared by the UA under storage pressure.");
            }
        } catch (err) {
            console.error(`Storage persist failed with ${err}`);
        }
    }
};

const fetchApiData = async () => {
    try {
        // To-Do: api-key-url etc 
        const apiUrl = `https://v6.exchangerate-api.com/v6/226c5a3e79c312d8ff7bc68a/latest/USD`;
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

const renderChart = async () => {
    const ctx = document.getElementById("barChart");
    const data = await fetchApiData();

    if (!data) {
        console.error("No data available to render chart.");
        return;
    }

    const currencies = [
        "USD", "GBP", "EUR", "NAD", "ZiG", "ZiG-Low",
        "ZiG-High", "AUD", "ZAR", "MZN", "AED", "BWP",
        "ZMW"
    ];

    const rates = currencies.map(currency => {
        if (currency === "ZiG") {
            return usdToZigConversionRate;
        } else if (currency === "ZiG-Low") {
            return usdToZigLowestInformalSecConversionRate;
        } else if (currency === "ZiG-High") {
            return usdToZigHighestInformalSecConversionRate;
        }
        else {
            return data.conversion_rates[currency];
        }
    });

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
                    "rgba(0, 255, 0, 0.2)",
                    "rgba(255, 255, 0, 0.2)",
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
                    "rgb(0, 255, 0)",
                    "rgb(255, 255, 0)",
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
    const fromCurrency = document.getElementById("fromCurrency").value;
    const toCurrency = document.getElementById("toCurrency").value;

    const data = await fetchApiData();
    if (!data) {
        console.error("No data available to update display elems.");
        return;
    }

    const lastUpdate = data.time_last_update_utc.slice(0, -6);

    document.getElementById("text-muted").textContent = `Updated ${lastUpdate}`;
    document.getElementById("conversionDescription").textContent = `Convert ${fromCurrency} to ${toCurrency}`;

    let fromToUsd = getToUsdRate(fromCurrency) || (1 / data.conversion_rates[fromCurrency]);
    let toUsd = getUsdRate(toCurrency) || data.conversion_rates[toCurrency];
    let rate = fromToUsd * toUsd;

    document.getElementById("rateDisplay").textContent = `1 ${fromCurrency} = ${rate.toFixed(4)} ${toCurrency}`;
};

document.addEventListener("DOMContentLoaded", () => {
    registerServiceWorker();
    updateDisplayElems();
    renderChart();

    const fromAmount = document.getElementById("fromAmount");
    const toAmount = document.getElementById("toAmount");
    const fromCurrency = document.getElementById("fromCurrency");
    const toCurrency = document.getElementById("toCurrency");

    fromAmount.addEventListener("input", () => {
        toAmount.value = "";
        convertCurrency("from");
    });

    toAmount.addEventListener("input", () => {
        fromAmount.value = "";
        convertCurrency("to");
    });

    fromCurrency.addEventListener("change", () => {
        updateDisplayElems();
        if (fromAmount.value) {
            toAmount.value = "";
            convertCurrency("from");
        } else if (toAmount.value) {
            fromAmount.value = "";
            convertCurrency("to");
        }
    });

    toCurrency.addEventListener("change", () => {
        updateDisplayElems();
        if (fromAmount.value) {
            toAmount.value = "";
            convertCurrency("from");
        } else if (toAmount.value) {
            fromAmount.value = "";
            convertCurrency("to");
        }
    });

    const clearButton = document.getElementById("clearButton");
    clearButton.addEventListener("click", () => {
        fromAmount.value = "";
        toAmount.value = "";
    });
});
