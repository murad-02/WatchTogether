import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @IsString()
  @MinLength(3)
  @MaxLength(24)
  @Matches(/^[a-zA-Z0-9_]+$/, {
    message: 'username may only contain letters, numbers and underscores',
  })
  username: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  @MaxLength(72)
  password: string;
}
