import { ImageResponse } from '@vercel/og';

export const config = { runtime: 'edge' };

export default function handler() {
  return new ImageResponse(
    {
      type: 'div',
      props: {
        style: {
          width: 1200,
          height: 630,
          display: 'flex',
          flexDirection: 'row',
          background: 'linear-gradient(135deg, #050510 0%, #0d0825 40%, #150a05 100%)',
          position: 'relative',
          overflow: 'hidden',
          fontFamily: 'sans-serif',
        },
        children: [
          // 배경 글로우 오렌지
          {
            type: 'div',
            props: {
              style: {
                position: 'absolute', top: -150, right: -150,
                width: 700, height: 700, borderRadius: 350,
                background: 'radial-gradient(circle, rgba(247,147,26,0.3) 0%, transparent 65%)',
              }
            }
          },
          // 배경 글로우 보라
          {
            type: 'div',
            props: {
              style: {
                position: 'absolute', bottom: -150, left: -150,
                width: 600, height: 600, borderRadius: 300,
                background: 'radial-gradient(circle, rgba(108,92,231,0.25) 0%, transparent 65%)',
              }
            }
          },
          // 상단 컬러 바
          {
            type: 'div',
            props: {
              style: {
                position: 'absolute', top: 0, left: 0, right: 0,
                height: 6,
                background: 'linear-gradient(90deg, #f7931a 0%, #a855f7 50%, #f7931a 100%)',
              }
            }
          },
          // 왼쪽: 비트코인 원
          {
            type: 'div',
            props: {
              style: {
                width: 400,
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                paddingLeft: 50,
              },
              children: {
                type: 'div',
                props: {
                  style: {
                    width: 300, height: 300, borderRadius: 150,
                    background: 'linear-gradient(135deg, #f7931a 0%, #ff5500 100%)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 0 100px rgba(247,147,26,0.8)',
                  },
                  children: {
                    type: 'span',
                    props: {
                      style: { fontSize: 170, fontWeight: 900, color: '#fff', lineHeight: 1 },
                      children: 'B'
                    }
                  }
                }
              }
            }
          },
          // 오른쪽: 텍스트 영역
          {
            type: 'div',
            props: {
              style: {
                flex: 1,
                display: 'flex', flexDirection: 'column',
                justifyContent: 'center',
                paddingRight: 60,
              },
              children: [
                // 브랜드명
                {
                  type: 'div',
                  props: {
                    style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 },
                    children: [
                      { type: 'div', props: { style: { width: 12, height: 12, borderRadius: 6, background: '#f7931a' } } },
                      { type: 'span', props: { style: { fontSize: 20, fontWeight: 700, color: '#a78bfa', letterSpacing: 2 }, children: 'PREDICTANALYTICS' } }
                    ]
                  }
                },
                // 메인 타이틀
                {
                  type: 'div',
                  props: {
                    style: { fontSize: 72, fontWeight: 900, color: '#fff', lineHeight: 1.05, marginBottom: 14 },
                    children: '예측 시장 분석'
                  }
                },
                // 서브
                {
                  type: 'div',
                  props: {
                    style: { fontSize: 26, color: '#f7931a', fontWeight: 600, marginBottom: 36 },
                    children: 'AI · 실시간 데이터 · 인사이트'
                  }
                },
                // 카드 3개
                {
                  type: 'div',
                  props: {
                    style: { display: 'flex', gap: 12 },
                    children: [
                      {
                        type: 'div',
                        props: {
                          style: {
                            background: 'rgba(247,147,26,0.12)', border: '2px solid rgba(247,147,26,0.5)',
                            borderRadius: 16, padding: '18px 20px',
                            display: 'flex', flexDirection: 'column', gap: 8,
                            flexGrow: 1, flexBasis: 0, minWidth: 0,
                          },
                          children: [
                            { type: 'span', props: { style: { fontSize: 17, color: '#f7931a', fontWeight: 600 }, children: 'BTC 예측' } },
                            { type: 'span', props: { style: { fontSize: 24, fontWeight: 900, color: '#fff' }, children: '실시간확률' } }
                          ]
                        }
                      },
                      {
                        type: 'div',
                        props: {
                          style: {
                            background: 'rgba(108,92,231,0.15)', border: '2px solid rgba(108,92,231,0.5)',
                            borderRadius: 16, padding: '18px 20px',
                            display: 'flex', flexDirection: 'column', gap: 8,
                            flexGrow: 1, flexBasis: 0, minWidth: 0,
                          },
                          children: [
                            { type: 'span', props: { style: { fontSize: 17, color: '#a78bfa', fontWeight: 600 }, children: '활성 마켓' } },
                            { type: 'span', props: { style: { fontSize: 24, fontWeight: 900, color: '#fff' }, children: '145,000+' } }
                          ]
                        }
                      },
                      {
                        type: 'div',
                        props: {
                          style: {
                            background: 'rgba(14,169,104,0.12)', border: '2px solid rgba(14,169,104,0.5)',
                            borderRadius: 16, padding: '18px 20px',
                            display: 'flex', flexDirection: 'column', gap: 8,
                            flexGrow: 1, flexBasis: 0, minWidth: 0,
                          },
                          children: [
                            { type: 'span', props: { style: { fontSize: 17, color: '#0ea968', fontWeight: 600 }, children: 'AI 분석' } },
                            { type: 'span', props: { style: { fontSize: 24, fontWeight: 900, color: '#fff' }, children: '무제한' } }
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
