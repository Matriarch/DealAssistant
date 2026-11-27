"use strict";

const { createPaymentCommand } = require("../utils/payment");

module.exports = (config, deps) => createPaymentCommand("sol", config, deps);
