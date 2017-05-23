/**
 * task name
 *
 * @ignore
 */

import * as mongoose from 'mongoose';
import * as reservationController from '../../app/controllers/reservation';

async function main(): Promise<void> {
    mongoose.connect(process.env.MONGOLAB_URI);
    await reservationController.resetTmps();
    mongoose.disconnect();
}

// tslint:disable-next-line:no-floating-promises
main().then(() => {
    process.exit(0);
}).catch((err) => {
    console.error(err);
});
