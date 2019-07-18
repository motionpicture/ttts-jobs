import { mongoose } from '@tokyotower/domain';

/**
 * mongoose接続オプション
 * @see http://mongoosejs.com/docs/api.html#index_Mongoose-connect
 * @see http://mongodb.github.io/node-mongodb-native/2.2/api/MongoClient.html
 */
const mongooseConnectionOptions: mongoose.ConnectionOptions = {
    autoIndex: false,
    autoReconnect: true,
    keepAlive: true,
    connectTimeoutMS: 30000,
    socketTimeoutMS: 0,
    reconnectTries: 30,
    reconnectInterval: 1000,
    useNewUrlParser: true
};

export default mongooseConnectionOptions;
