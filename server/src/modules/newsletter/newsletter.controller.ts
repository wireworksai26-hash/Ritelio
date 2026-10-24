import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { ListSubscribersQueryDto, SubscribeDto } from './dto/newsletter.dto';
import { NewsletterService } from './newsletter.service';

@Controller('newsletter')
export class NewsletterController {
  constructor(private readonly newsletter: NewsletterService) {}

  /**
   * Formulir langganan di footer halaman depan. Publik tanpa login, jadi dibatasi lajunya per alamat IP dan
   * jawabannya selalu sama, apa pun keadaan alamatnya (lihat NewsletterService.subscribe).
   */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(202)
  @Post('subscribe')
  async subscribe(@Body() dto: SubscribeDto) {
    await this.newsletter.subscribe(dto.email, dto.website);
    return { ok: true };
  }

  @Get('subscribers')
  @RequirePermissions('settings:write')
  list(@CurrentUser() user: AuthUser, @Query() query: ListSubscribersQueryDto) {
    return this.newsletter.list(user, query);
  }

  @Get('subscribers/export')
  @RequirePermissions('settings:write')
  exportAll(@CurrentUser() user: AuthUser) {
    return this.newsletter.exportAll(user);
  }

  @HttpCode(200)
  @Post('subscribers/:id/unsubscribe')
  @RequirePermissions('settings:write')
  unsubscribe(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.newsletter.unsubscribe(user, id);
  }

  @Delete('subscribers/:id')
  @RequirePermissions('settings:write')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.newsletter.remove(user, id);
  }
}
