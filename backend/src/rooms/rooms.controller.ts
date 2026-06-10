import {
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { RoomsService } from './rooms.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

interface AuthUser {
  id: string;
  username: string;
}

@Controller('rooms')
@UseGuards(JwtAuthGuard)
export class RoomsController {
  constructor(private readonly rooms: RoomsService) {}

  @Post()
  create(@CurrentUser() user: AuthUser) {
    return this.rooms.createRoom(user.id);
  }

  @Get(':code')
  get(@Param('code') code: string) {
    return this.rooms.getRoomState(code);
  }

  @Post(':code/join')
  join(@Param('code') code: string, @CurrentUser() user: AuthUser) {
    return this.rooms.joinRoom(code, user.id);
  }
}
