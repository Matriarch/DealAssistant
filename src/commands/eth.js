"use strict";

const { createPaymentCommand } = require("../utils/payment");

module.exports = (config, deps) => createPaymentCommand("eth", config, deps);
