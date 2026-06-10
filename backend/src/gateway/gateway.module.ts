import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { RoomsModule } from '../rooms/rooms.module';
import { RoomGateway } from './room.gateway';

@Module({
  imports: [
    RoomsModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'dev-secret',
    }),
  ],
  providers: [RoomGateway],
})
export class GatewayModule {}
