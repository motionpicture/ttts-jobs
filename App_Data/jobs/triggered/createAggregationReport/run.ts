/**
 * 売上レポートに対する集計データを更新する
 * @ignore
 */

import * as ttts from '@motionpicture/ttts-domain';
import * as moment from 'moment-timezone';

import mongooseConnectionOptions from '../../../../mongooseConnectionOptions';
ttts.mongoose.connect(<string>process.env.MONGOLAB_URI, mongooseConnectionOptions);

main().then(() => {
    ttts.mongoose.disconnect();
})

async function main() {
    // 前日を集計する。UTC時間と日本時間に注意！！
    // 日本時間の深夜にバッチを起動するということは、UTC時間だとまだ日付が変わってない。
    // const targetDate = moment().add('day', -1).format('YYYY/MM/DD');
    const targetDate = moment().format('YYYY/MM/DD');
    console.log(`byEndDate:${targetDate}`)
    try {
        await ttts.service.aggregate.report4sales.aggregateSalesByEndDate(
            targetDate
        )(
            new ttts.repository.Reservation(ttts.mongoose.connection),
            new ttts.repository.Transaction(ttts.mongoose.connection),
            new ttts.repository.AggregateSale(ttts.mongoose.connection)
            )
    } catch (error) {
        console.log(`error byEndDate:${targetDate}`)
    }

    console.log(`byEventStartDate:${targetDate}`)
    try {
        await ttts.service.aggregate.report4sales.aggregateSalesByEventStartDate(
            targetDate
        )(
            new ttts.repository.Reservation(ttts.mongoose.connection),
            new ttts.repository.Transaction(ttts.mongoose.connection),
            new ttts.repository.AggregateSale(ttts.mongoose.connection)
            )
    } catch (error) {
        console.log(`error byEventStartDate:${targetDate}`)
    }
}