/**
 * task name
 * @ignore
 */

import * as ttts from '@motionpicture/ttts-domain';
import * as conf from 'config';
import * as  moment from 'moment';
import * as numeral from 'numeral';

ttts.mongoose.connect(<string>process.env.MONGOLAB_URI);
let count = 0;

const INTERVAL_MILLISECONDS = 250;
const MAX_NUMBER_OF_PARALLEL_TASK = 10;
setInterval(
    async () => {
        if (count > MAX_NUMBER_OF_PARALLEL_TASK) {
            return;
        }

        count += 1;

        try {
            await refundForSuspend();
        } catch (error) {
            console.error(error);
        }

        count -= 1;
    },
    INTERVAL_MILLISECONDS
);

/**
 * GMO返金(エレベータ運用停止の対応)
 */
export async function refundForSuspend() {

    // 対象パフォーマンス取得
    // targrtInfoByPayment: {'20171201_12345': [r1,r2,,,rn]}
    const info = await getRefundReservations();
    const reservationInfo = info.targrtInfoByPayment;

    const now = moment().format('YYYY/MM/DD HH:mm:ss');
    const performanceInfo: any = {};

    // GMO返金処理(購入単位)
    for (const key of Object.keys(reservationInfo)) {
        const reservation = reservationInfo[key][0];
        // 取引状態参照
        const searchResult = await ttts.GMO.services.credit.searchTrade({
            shopId: <string>process.env.GMO_SHOP_ID,
            shopPass: <string>process.env.GMO_SHOP_PASS,
            orderId: <string>reservation.gmo_order_id
        });

        // 返金済ではない時(リトライ時エラーにならないためのIf分)
        if (searchResult.status !== ttts.GMO.utils.util.JobCd.Return) {
            // 決済取り消し(返品)処理
            await ttts.GMO.services.credit.alterTran({
                shopId: <string>process.env.GMO_SHOP_ID,
                shopPass: <string>process.env.GMO_SHOP_PASS,
                accessId: <string>reservation.gmo_access_id,
                accessPass: <string>reservation.gmo_access_pass,
                jobCd: ttts.GMO.utils.util.JobCd.Return
            });
            // パフォーマンス単位の返金数セット
            if (performanceInfo.hasOwnProperty(reservation.performance) === false) {
                // ※リトライ前提なら初期値は0ではなく、パフォーマンスから現在の返金済数を取得する必要あり
                performanceInfo[reservation.performance] = await getPerformanceRefundCount(reservation.performance);
            }
            // +1は購入数、lengthはレコード数
            //performanceInfo[reservation.performance] += 1;
            performanceInfo[reservation.performance] += getRefundCount(reservationInfo[key]);
            // 返金メール作成
            await createEmail(reservationInfo[key]);
        }

        // キャンセルリクエスト保管(返金情報は'3'(返金完了)に更新)
        const reservationNew = reservationInfo[key][0];
        reservationNew.performance_ttts_extension.refund_status = ttts.PerformanceUtil.REFUND_STATUS.COMPLETE;
        reservationNew.performance_ttts_extension.refund_update_at = now;
        // await createCustomerCancelRequest(reservationNew, reservationInfo[key]);

        // 予約データクリア
        await clearReservation(reservationInfo[key]);
    }

    const performanceRepo = new ttts.repository.Performance(ttts.mongoose.connection);
    // パフォーマンスに返金状態、返金済み数を更新
    for (const performanceId of Object.keys(performanceInfo)) {
        const paymentCount: number = performanceInfo[performanceId];
        // パフォーマンス更新
        await performanceRepo.performanceModel.findOneAndUpdate(
            {
                _id: performanceId
            },
            {
                $set: {
                    'ttts_extension.refunded_count': paymentCount,
                    'ttts_extension.refund_status': ttts.PerformanceUtil.REFUND_STATUS.COMPLETE,
                    'ttts_extension.refund_update_at': now
                }
            }
        ).exec();
    }
}
/**
 * 返金対象予約情報取得
 *
 *  info: {
 *     targrtInfoByPayment: {'20171201_12345': [r1,r2,,,rn]}
 * }
 *
 * @return {any}
 */
async function getRefundReservations(): Promise<any> {
    const reservationRepo = new ttts.repository.Reservation(ttts.mongoose.connection);

    let info: any = null;

    // 返金対象予約取得(一般予約かつ返金ステータスが指示済)
    const reservations = await reservationRepo.reservationModel.find(
        {
            purchaser_group: ttts.ReservationUtil.PURCHASER_GROUP_CUSTOMER,
            'performance_ttts_extension.refund_status': ttts.PerformanceUtil.REFUND_STATUS.INSTRUCTED
        }
    ).exec();

    // 入塔済の予約情報セット
    const arrivedInfos: any[] = [];
    reservations.map((reservation: any) => {
        // 入塔済情報 [{performance_day:'20171201', payment_no:'12345'}]
        if (reservation.checkins.length > 0) {
            arrivedInfos.push({
                performance_day: reservation.performance_day,
                payment_no: reservation.payment_no
            });
        }
    });

    // 入塔済判定
    const isArrived = (reservation: any): boolean => {
        for (const arrivedInfo of arrivedInfos) {
            if (arrivedInfo.performance_day === reservation.performance_day &&
                arrivedInfo.payment_no === reservation.payment_no) {
                return true;
            }
        }

        return false;
    };

    // 更新対象の予約IDセット
    const targrtInfoByPayment: any = {};
    //const targrtInfoByPerformance: any[] = [];
    reservations.map((reservation: any) => {
        // 入塔記録がない時
        if (isArrived(reservation) === false) {
            // 返金対象(購入単位) [{'20171201_12345': [r1,r2,,,rn]}]
            const key: string = `${reservation.performance_day}_${reservation.payment_no}`;
            if (targrtInfoByPayment.hasOwnProperty(key) === false) {
                targrtInfoByPayment[key] = [];
            }
            targrtInfoByPayment[key].push(reservation);
        }
    });

    // 戻り値セット
    info = {};
    info.targrtInfoByPayment = targrtInfoByPayment;

    return info;
}
/**
 * 現在のパフォーマンスにセットされている返金数取得
 *
 * @return {number}
 */
async function getPerformanceRefundCount(performanceId: string): Promise<any> {
    const performanceRepo = new ttts.repository.Performance(ttts.mongoose.connection);
    // パフォーマンス更新
    const performance = await performanceRepo.performanceModel.findById(
        {
            _id: performanceId
        }
    ).exec();

    return performance !== null ? (<any>performance).ttts_extension.refunded_count : 0;
}
/**
 * 返金予約数取得
 *   (車椅子チケットは4レコードで1予約)
 *
 * @return {number}
 */
function getRefundCount(reservations: any[]): number {
    return reservations.filter((reservation) => (reservation.status === ttts.factory.reservationStatusType.ReservationConfirmed)).length;
}
/**
 * 返金メール作成(1通)
 *
 * @param {Response} res
 * @param {any} reservation
 * @param {any} notice
 * @return {Promise<void>}
 */
async function createEmail(reservations: any[]): Promise<void> {

    if (reservations === null) {

        return;
    }
    const reservation = reservations[0];
    // 本文編集(日本語)
    const infoJa = getEmailMessages(reservation, 'ja');
    const contentJa: string = `${infoJa.titleEmail}\n\n${infoJa.purchaserName}\n\n${infoJa.messageInfos.join('\n')}`;
    // 本文編集(英語)
    const infoEn = getEmailMessages(reservation, 'en');
    const contentEn: string = `${infoEn.titleEmail}\n\n${infoEn.purchaserName}\n\n${infoEn.messageInfos.join('\n')}`;
    const line: string = '--------------------------------------------------';
    // メール編集
    const emailQueue = {
        from: {
            address: conf.get<string>('email.from'),
            name: conf.get<string>('email.fromname')
        },
        to: {
            address: reservation.purchaser_email
        },
        subject: `${infoJa.title} ${infoJa.titleEmail} (${infoEn.title} ${infoEn.titleEmail})`,
        content: {
            mimetype: 'text/plain',
            text: `${contentJa}\n\n${line}\n${contentEn}`
        },
        status: ttts.EmailQueueUtil.STATUS_UNSENT
    };

    // メール作成
    await ttts.Models.EmailQueue.create(emailQueue);
}
/**
 * メールメッセージ取得
 *
 * @param {any} reservation
 * @param {any} locale
 * @return {any}
 */
function getEmailMessages(reservation: any, locale: string): any {
    // 購入者氏名
    const purchaserName: string = reservation.purchaser_name[locale];
    // 入塔日
    const day: string = moment(reservation.performance_day, 'YYYYMMDD').format('YYYY/MM/DD');
    // tslint:disable-next-line:no-magic-numbers
    const time: string = `${reservation.performance_start_time.substr(0, 2)}:${reservation.performance_start_time.substr(2, 2)}`;
    // 返金額
    const amount: string = numeral(reservation.gmo_amount).format('0,0');

    // 返金メールメッセージ
    const messages: string[] = conf.get<string[]>(`emailRefund.${locale}.messages`);
    // 購入チケット情報
    const messageInfos: string[] = [];
    for (const message of messages) {
        let editMessage: string = message;
        // 購入番号 : 850000001
        editMessage = editMessage.replace('$payment_no$', reservation.payment_no);
        // ご来塔日時 : 2017/12/10 09:15
        editMessage = editMessage.replace('$day$', day);
        editMessage = editMessage.replace('$start_time$', time);
        // 返金金額 : \8,400
        editMessage = editMessage.replace('$amount$', amount);
        messageInfos.push(editMessage);
    }

    return {
        // 東京タワー TOP DECK Ticket
        title: conf.get<string>(`emailRefund.${locale}.title`),
        // 返金のお知らせ
        titleEmail: conf.get<string>(`emailRefund.${locale}.titleEmail`),
        //トウキョウ タロウ 様
        purchaserName: conf.get<string>(`emailRefund.${locale}.destinationName`).replace('$purchaser_name$', purchaserName),
        // 返金メールメッセージ
        messageInfos: messageInfos
    };
}
/**
 * 予約情報クリア
 *
 * @param {any} reservations
 * @return {Promise<void>}
 */
async function clearReservation(reservations: any[]): Promise<void> {
    const reservationRepo = new ttts.repository.Reservation(ttts.mongoose.connection);

    const promises = ((<any>reservations).map(async (reservation: any) => {

        // 本体チケットかつ特殊チケットの時、時間ごとの予約データ解放(AVAILABLEに変更)
        if (reservation.ticket_ttts_extension.category !== ttts.TicketTypeGroupUtil.TICKET_TYPE_CATEGORY_NORMAL &&
            reservation.seat_code === reservation.reservation_ttts_extension.seat_code_base) {
            await ttts.Models.ReservationPerHour.findOneAndUpdate(
                { reservation_id: reservation._id.toString() },
                {
                    $set: { status: ttts.factory.itemAvailability.InStock },
                    $unset: { expired_at: 1, reservation_id: 1 }
                },
                { new: true }
            ).exec();
            //logger.info('ReservationPerHour clear reservation_id=', reservation._id.toString());
        }

        // 予約データ解放(AVAILABLEに変更)
        await reservationRepo.reservationModel.findByIdAndUpdate(
            reservation._id,
            {
                status: ttts.factory.reservationStatusType.ReservationCancelled
            }
        ).exec();

        // tslint:disable-next-line:no-suspicious-comment
        // TODO 在庫を有に変更
    }));
    await Promise.all(promises);
}
