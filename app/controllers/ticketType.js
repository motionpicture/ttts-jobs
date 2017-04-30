"use strict";
/**
 * 券種タスクコントローラー
 *
 * @namespace TicketTypeController
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const chevre_domain_1 = require("@motionpicture/chevre-domain");
const createDebug = require("debug");
const fs = require("fs-extra");
const debug = createDebug('chevre-api:task:controller:ticketType');
/**
 * @memberOf FilmController
 */
function createFromJson() {
    fs.readFile(`${process.cwd()}/data/${process.env.NODE_ENV}/ticketTypes.json`, 'utf8', (err, data) => __awaiter(this, void 0, void 0, function* () {
        if (err instanceof Error) {
            throw err;
        }
        const ticketTypes = JSON.parse(data);
        const promises = ticketTypes.map((ticketType) => __awaiter(this, void 0, void 0, function* () {
            debug('updating ticketType...');
            yield chevre_domain_1.Models.TicketType.findOneAndUpdate({
                _id: ticketType._id
            }, ticketType, {
                new: true,
                upsert: true
            }).exec();
            debug('ticketType updated');
        }));
        yield Promise.all(promises);
        debug('promised.');
    }));
}
exports.createFromJson = createFromJson;
