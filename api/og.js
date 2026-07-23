import { ImageResponse } from '@vercel/og';

export const config = { runtime: 'edge' };

export default function handler() {
  return new ImageResponse(
    {
      type: 'div',
      props: {
        style: {
          width: '1200px',
          height: '630px',
          display: 'flex',
          flexDirection: 'column',
          background: 'linear-gradient(135deg, #0a0a1a 0%, #0f0a2e 50%, #1a0a0a 100%)',
          position: 'relative',
          overflow: 'hidden',
        },
        children: [
          // 배경 원형 장식
          {
            type: 'div',
            props: {
              style: {
                position: 'absolute', top: '-100px', right: '-100px',
                width: '500px', height: '500px', borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(247,147,26,0.25) 0%, transparent 70%)',
              }
            }
          },
          {
            type: 'div',
            props: {
              style: {
                position: 'absolute', bottom: '-80px', left: '-80px',
                width: '400px', height: '400px', borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(108,92,231,0.2) 0%, transparent 70%)',
              }
            }
          },
          // 상단 바
          {
            type: 'div',
            props: {
              style: {
                position: 'absolute', top: '0', left: '0', right: '0',
                height: '4px',
                background: 'linear-gradient(90deg, #f7931a, #6c5ce7, #f7931a)',
              }
            }
          },
          // 메인 콘텐츠
          {
            type: 'div',
            props: {
              style: {
                display: 'flex', flexDirection: 'column',
                padding: '60px 80px', flex: '1',
              },
              children: [
                // 로고 행
                {
                  type: 'div',
                  props: {
                    style: { display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '40px' },
                    children: [
                      {
                        type: 'div',
                        props: {
                          style: {
                            width: '48px', height: '48px', borderRadius: '12px',
                            background: 'linear-gradient(135deg, #6c5ce7, #a855f7)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '26px',
                          },
                          children: '📊'
                        }
                      },
                      {
                        type: 'span',
                        props: {
                          style: { fontSize: '22px', fontWeight: '700', color: '#a78bfa' },
                          children: 'PredictAnalytics'
                        }
                      }
                    ]
                  }
                },
                // 비트코인 심볼 + 제목
                {
                  type: 'div',
                  props: {
                    style: { display: 'flex', alignItems: 'center', gap: '24px', marginBottom: '20px' },
                    children: [
                      {
                        type: 'div',
                        props: {
                          style: {
                            width: '110px', height: '110px', borderRadius: '50%',
                            background: 'linear-gradient(135deg, #f7931a, #ff6b00)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '64px', fontWeight: '900', color: '#fff',
                            boxShadow: '0 0 40px rgba(247,147,26,0.6)',
                          },
                          children: 'B'
                        }
                      },
                      {
                        type: 'div',
                        props: {
                          style: { display: 'flex', flexDirection: 'column', gap: '8px' },
                          children: [
                            {
                              type: 'span',
                              props: {
                                style: { fontSize: '52px', fontWeight: '900', color: '#ffffff', lineHeight: '1' },
                                children: '예측 시장 분석'
                              }
                            },
                            {
                              type: 'span',
                              props: {
                                style: { fontSize: '24px', color: '#f7931a', fontWeight: '600' },
                                children: 'AI · 실시간 데이터 · 인사이트'
                              }
                            }
                          ]
                        }
                      }
                    ]
                  }
                },
                // 통계 카드들
                {
                  type: 'div',
                  props: {
                    style: { display: 'flex', gap: '16px', marginTop: '32px' },
                    children: [
                      {
                        type: 'div',
                        props: {
                          style: {
                            background: 'rgba(247,147,26,0.15)', border: '1px solid rgba(247,147,26,0.4)',
                            borderRadius: '12px', padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: '4px',
                          },
                          children: [
                            { type: 'span', props: { style: { fontSize: '13px', color: '#f7931a' }, children: '비트코인 예측' } },
                            { type: 'span', props: { style: { fontSize: '22px', fontWeight: '800', color: '#fff' }, children: '실시간 확률' } }
                          ]
                        }
                      },
                      {
                        type: 'div',
                        props: {
                          style: {
                            background: 'rgba(108,92,231,0.2)', border: '1px solid rgba(108,92,231,0.4)',
                            borderRadius: '12px', padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: '4px',
                          },
                          children: [
                            { type: 'span', props: { style: { fontSize: '13px', color: '#a78bfa' }, children: '활성 마켓' } },
                            { type: 'span', props: { style: { fontSize: '22px', fontWeight: '800', color: '#fff' }, children: '145,000+' } }
                          ]
                        }
                      },
                      {
                        type: 'div',
                        props: {
                          style: {
                            background: 'rgba(14,169,104,0.15)', border: '1px solid rgba(14,169,104,0.4)',
                            borderRadius: '12px', padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: '4px',
                          },
                          children: [
                            { type: 'span', props: { style: { fontSize: '13px', color: '#0ea968' }, children: 'AI 분석' } },
                            { type: 'span', props: { style: { fontSize: '22px', fontWeight: '800', color: '#fff' }, children: '무제한 인사이트' } }
                          ]
                        }
                      }
                    ]
                  }
                }
              ]
            }
          }
        ]
      }
    },
    { width: 1200, height: 630 }
  );
}
